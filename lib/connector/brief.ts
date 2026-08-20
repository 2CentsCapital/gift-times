import { db } from "./core";

const SITE = "https://giftcitytimes.com";

const LEVELS = [
  { name: "GIFT Rookie", min: 0 },
  { name: "GIFT Insider", min: 60 },
  { name: "GIFT Analyst", min: 250 },
  { name: "GIFT Oracle", min: 600 },
  { name: "GIFT Legend", min: 1200 },
];
export function levelFor(points: number) {
  let cur = LEVELS[0];
  let next = null as null | { name: string; min: number };
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].min) cur = LEVELS[i];
    else { next = LEVELS[i]; break; }
  }
  return { name: cur.name, next };
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const dayNum = () => Math.floor(Date.now() / 86400000);

// Streak + attendance points, credited once per calendar day on brief open.
export async function touchStreak(account: any) {
  const today = todayIso();
  if (account.last_brief_on === today) return account;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = account.last_brief_on === yesterday ? (account.streak || 0) + 1 : 1;
  const best = Math.max(account.best_streak || 0, streak);
  const { data } = await db()
    .from("connector_accounts")
    .update({ streak, best_streak: best, last_brief_on: today, points: (account.points || 0) + 5 })
    .eq("id", account.id)
    .select("*")
    .single();
  return data || account;
}

async function categoryCounts(): Promise<{ category: string; count: number }[]> {
  const supa = db();
  const counts: Record<string, number> = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await supa.from("entities").select("category").eq("status", "Active").range(from, from + 999);
    if (!data || !data.length) break;
    for (const e of data) counts[(e as any).category || "Other"] = (counts[(e as any).category || "Other"] || 0) + 1;
    if (data.length < 1000) break;
  }
  return Object.entries(counts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}

function funFact(cats: { category: string; count: number }[], total: number): string {
  const byName = Object.fromEntries(cats.map((c) => [c.category, c.count]));
  const facts = [
    `GIFT IFSC now has ${total.toLocaleString("en-IN")} regulated entities.`,
    `Fund Management leads the register with ${(byName["Fund Management"] || 0).toLocaleString("en-IN")} entities.`,
    `Metals & Commodities (${byName["Metals & Commodities entities"] || 0}) and Qualified Jewellers (${byName["Qualified Jewellers"] || 0}) make GIFT a bullion hub.`,
    `${byName["Foreign Universities"] || 0} foreign universities have set up in GIFT City.`,
    `${byName["Fintech Sandbox Entities"] || 0} entities are live in the IFSCA fintech sandbox.`,
    `${byName["Banking"] || 0} IFSC Banking Units operate out of GIFT City.`,
  ];
  return facts[dayNum() % facts.length];
}

// Deterministic daily quiz (same question for everyone that day → fair leaderboard).
async function generateQuiz(cats: { category: string; count: number }[]) {
  const pool = cats.filter((c) => c.count >= 5);
  const pick = pool[dayNum() % pool.length];
  const n = pick.count;
  const label = pick.category.replace(/ entities$/, "");
  const distract = [n + 7 + (dayNum() % 5), Math.max(1, n - 6 - (dayNum() % 4)), n + 21];
  const options = Array.from(new Set([n, ...distract])).slice(0, 4).sort(() => ((dayNum() % 2) - 0.5));
  return {
    question: `📊 Daily quiz: How many entities are registered in GIFT IFSC under "${label}"?`,
    answer: String(n),
    options: options.map(String),
  };
}

export async function ensureQuiz(account: any, cats?: { category: string; count: number }[]) {
  const today = todayIso();
  const supa = db();
  const { data: existing } = await supa
    .from("connector_quiz")
    .select("*")
    .eq("account_id", account.id)
    .eq("quiz_on", today)
    .maybeSingle();
  if (existing) return existing;
  const q = await generateQuiz(cats || (await categoryCounts()));
  const { data } = await supa
    .from("connector_quiz")
    .insert({ account_id: account.id, quiz_on: today, question: q.question, answer: q.answer, options: q.options })
    .select("*")
    .single();
  return data;
}

export async function gradeQuiz(account: any, submitted: string) {
  const quiz = await ensureQuiz(account);
  if (quiz.answered) {
    return { alreadyAnswered: true, wasCorrect: quiz.was_correct, correctAnswer: quiz.answer, points: account.points };
  }
  const correct = String(submitted).trim() === String(quiz.answer).trim();
  const gained = correct ? 20 : 3;
  const { data: acc } = await db()
    .from("connector_accounts")
    .update({ points: (account.points || 0) + gained })
    .eq("id", account.id)
    .select("*")
    .single();
  await db().from("connector_quiz").update({ answered: true, was_correct: correct }).eq("id", quiz.id);
  return {
    alreadyAnswered: false,
    wasCorrect: correct,
    correctAnswer: quiz.answer,
    gained,
    points: acc?.points ?? account.points,
    level: levelFor(acc?.points ?? account.points),
  };
}

// The morning brief (compact markdown, well under the 5k-token tool cap).
export async function buildBrief(accountIn: any) {
  const account = await touchStreak(accountIn);
  const supa = db();
  const cats = await categoryCounts();
  const total = cats.reduce((s, c) => s + c.count, 0);

  const interests: string[] = Array.isArray(account.interests) ? account.interests : [];
  let q = supa.from("changes").select("desk,headline,url,occurred_on").order("occurred_on", { ascending: false }).limit(interests.length ? 40 : 12);
  const { data: changesRaw } = await q;
  let changes = changesRaw || [];
  if (interests.length) changes = changes.filter((c: any) => interests.includes(c.desk)).slice(0, 12);

  const quiz = await ensureQuiz(account, cats);
  const lvl = levelFor(account.points || 0);

  const lines: string[] = [];
  lines.push(`# ☀️ Your GIFT City Times brief — ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}`);
  lines.push("");
  lines.push(`🔥 **Streak: ${account.streak} day${account.streak === 1 ? "" : "s"}** · ${account.points} pts · **${lvl.name}**${lvl.next ? ` (${lvl.next.min - (account.points || 0)} pts to ${lvl.next.name})` : " — max level!"}`);
  lines.push("");
  lines.push(`💡 **Fun fact:** ${funFact(cats, total)}`);
  lines.push("");
  if (changes.length) {
    lines.push(`## 📰 What's new${interests.length ? " in your desks" : ""}`);
    for (const c of changes.slice(0, 8)) {
      const link = c.url ? (c.url.startsWith("http") ? c.url : `${SITE}${c.url}`) : "";
      lines.push(`- **[${c.desk}]** ${c.headline}${link ? ` — ${link}` : ""} _(${c.occurred_on})_`);
    }
  } else {
    lines.push(`## 📰 What's new\n- Quiet on the wire — no new IFSCA activity in your desks.`);
  }
  lines.push("");
  lines.push(`## 🎯 ${quiz.question}`);
  lines.push(`Options: ${(quiz.options as string[]).join(" · ")}`);
  lines.push(`_Reply with your answer, or call \`answer_quiz\` — a correct answer earns 20 pts and keeps your streak alive._`);
  lines.push("");
  lines.push(`Browse the full paper: ${SITE}`);

  return {
    markdown: lines.join("\n"),
    streak: account.streak,
    points: account.points,
    level: lvl.name,
    quiz: { question: quiz.question, options: quiz.options },
    newItems: changes.length,
  };
}

// The GIFT Times — ingestion engine.
//
//   - Full backfill on first run (fetches detail for every entity).
//   - Daily diff afterwards: only new entities get a detail fetch.
//   - Records every add/remove/status-change/new-publication into `changes`,
//     which drives both the website and the morning newsletter.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run: node scripts/ingest.mjs

import { supa } from "./lib/supabase.mjs";
import * as ifsca from "./lib/ifsca.mjs";

const LEGAL_KIND = {
  Regulations: "regulation",
  Circular: "circular",
  Notification: "notification",
  Rules: "rules",
  Guidelines: "guidelines",
  "AML/CFT/KYC": "aml",
  News: "news",
  Consultation: "consultation",
  Tender: "tender",
  Report: "report",
  AnnualReport: "annual_report",
  Bulletin: "bulletin",
  Speech: "speech",
  Career: "career",
  InformalGuidance: "informal_guidance",
};

// Nicer names for change headlines.
const KIND_LABEL = {
  circular: "circular",
  regulation: "regulation",
  notification: "notification",
  rules: "rule",
  guidelines: "guideline",
  aml: "AML/CFT/KYC update",
  news: "news item",
  consultation: "consultation paper",
  tender: "tender",
  report: "report / study",
  annual_report: "annual report",
  bulletin: "bulletin",
  speech: "speech",
  career: "vacancy notice",
  informal_guidance: "informal guidance",
};

function deskForEntity(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("capital market")) return "Brokers";
  if (c.includes("fund management")) return "FMEs";
  if (c.includes("insurance")) return "Insurance";
  if (c.includes("fintech")) return "Fintech";
  if (c.includes("banking") || c.includes("finance company") || c.includes("payment"))
    return "Banking";
  if (c.includes("surrender") || c.includes("cancel")) return "Surrendered";
  return "Other";
}

const ENTITY_HEADLINE = {
  Brokers: "New broker / capital-market intermediary",
  FMEs: "New fund management entity",
  Insurance: "New insurance entity",
  Fintech: "New fintech (sandbox) entity",
  Banking: "New banking / finance entity",
  Other: "New registered entity",
};

function deskForPub(kind) {
  if (kind === "circular") return "Circulars";
  if (["regulation", "notification", "rules", "guidelines", "aml"].includes(kind))
    return "Regulations";
  if (kind === "news") return "News";
  if (kind === "consultation") return "Consultations";
  if (kind === "tender") return "Tenders";
  if (["report", "annual_report", "bulletin"].includes(kind)) return "Reports";
  if (kind === "speech") return "Speeches";
  if (kind === "career") return "Careers";
  if (kind === "informal_guidance") return "Guidance";
  return "Other";
}

// Run async tasks with bounded concurrency.
async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function loadExistingEntities() {
  const map = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supa
      .from("entities")
      .select("id, encrypted_id, category, subcategory, status")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data) map.set(row.encrypted_id, row);
    if (data.length < pageSize) break;
  }
  return map;
}

async function insertEntity(listItem, detail, changes) {
  const desk = deskForEntity(listItem.category);
  const isSurrendered = desk === "Surrendered";
  const { data, error } = await supa
    .from("entities")
    .insert({
      encrypted_id: listItem.encryptedId,
      df_id: detail.dfId,
      name: detail.name || listItem.name,
      category: listItem.category,
      subcategory: listItem.subcategory || detail.subcategory,
      registration_number: detail.registrationNumber,
      date_of_registration: detail.dateOfRegistration,
      validity_to: detail.validityTo,
      registered_address: detail.registeredAddress,
      contact_person: detail.contactPerson,
      email: detail.email,
      website: detail.website,
      remarks: detail.remarks,
      is_active: detail.isActive,
      status: isSurrendered ? "Surrendered/Cancelled" : "Active",
      desk,
      ifsca_modified_on: detail.modifiedOn,
      detail_fetched_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;

  if (detail.contactPerson) {
    await supa
      .from("people")
      .upsert(
        {
          entity_id: data.id,
          name: detail.contactPerson,
          email: detail.email,
          role: "Contact Person",
        },
        { onConflict: "entity_id,name" }
      );
  }

  // Only log as "news" if it's an active registration (not a pre-existing
  // surrendered record surfacing on the very first backfill).
  changes.push({
    change_type: "entity_added",
    desk,
    headline: `${ENTITY_HEADLINE[desk] || "New registered entity"}: ${detail.name || listItem.name}`,
    category: listItem.category,
    ref_table: "entities",
    ref_id: data.id,
    url: `/entity/${data.id}`,
    detail: {
      registration_number: detail.registrationNumber,
      date_of_registration: detail.dateOfRegistration,
      subcategory: listItem.subcategory,
      contact_person: detail.contactPerson,
    },
  });
  return data.id;
}

async function ingestEntities(isFull, changes) {
  const list = await ifsca.fetchEntityList();
  const existing = await loadExistingEntities();
  const seen = new Set();

  const newItems = [];
  const movedToSurrendered = [];

  for (const item of list) {
    seen.add(item.encryptedId);
    const prev = existing.get(item.encryptedId);
    if (!prev) {
      newItems.push(item);
    } else {
      const desk = deskForEntity(item.category);
      const becameSurrendered =
        desk === "Surrendered" && prev.status !== "Surrendered/Cancelled";
      if (becameSurrendered) movedToSurrendered.push({ prev, item });
      // Only write when something actually changed — avoids ~2000 no-op
      // updates every run. (last_seen isn't used for removal detection.)
      const changed =
        item.category !== prev.category ||
        item.subcategory !== prev.subcategory ||
        becameSurrendered;
      if (changed) {
        await supa
          .from("entities")
          .update({
            category: item.category,
            subcategory: item.subcategory,
            desk,
            status: desk === "Surrendered" ? "Surrendered/Cancelled" : prev.status || "Active",
            last_seen: new Date().toISOString(),
          })
          .eq("id", prev.id);
      }
    }
  }

  // Fetch detail + insert for new entities (bounded concurrency).
  let added = 0;
  await mapPool(newItems, 6, async (item) => {
    try {
      const detail = await ifsca.fetchEntityDetail(item.encryptedId);
      detail.category = item.category;
      await insertEntity(item, detail, changes);
      added++;
    } catch (e) {
      console.error(`  ! detail failed for ${item.name}: ${e.message}`);
    }
  });

  // Status changes.
  for (const { prev, item } of movedToSurrendered) {
    changes.push({
      change_type: "entity_status_change",
      desk: deskForEntity(prev.category),
      headline: `Registration surrendered / cancelled: ${item.name}`,
      category: item.category,
      ref_table: "entities",
      ref_id: prev.id,
      url: `/entity/${prev.id}`,
      detail: { from: prev.category, to: item.category },
    });
  }

  // Removed entirely (present before, absent now).
  let removed = 0;
  for (const [encId, prev] of existing) {
    if (seen.has(encId)) continue;
    if (prev.status === "Removed") continue;
    await supa.from("entities").update({ status: "Removed" }).eq("id", prev.id);
    changes.push({
      change_type: "entity_removed",
      desk: deskForEntity(prev.category),
      headline: `Entity removed from directory`,
      category: prev.category,
      ref_table: "entities",
      ref_id: prev.id,
      url: `/entity/${prev.id}`,
      detail: {},
    });
    removed++;
  }

  return { total: list.length, added, removed, statusChanges: movedToSurrendered.length };
}

async function ingestPublications(changes) {
  const feeds = await ifsca.fetchAllPublications();
  const summary = {};
  for (const [label, rows] of Object.entries(feeds)) {
    const kind = LEGAL_KIND[label];
    const desk = deskForPub(kind);

    // existing ids for this kind
    const { data: existRows, error } = await supa
      .from("publications")
      .select("ifsca_id")
      .eq("kind", kind);
    if (error) throw error;
    const existing = new Set((existRows || []).map((r) => r.ifsca_id));
    // First time we ingest a given kind (e.g. a newly-added feed): seed it
    // silently so we don't flood the change log with the whole back-catalogue.
    const isFirstKind = existing.size === 0;

    const fresh = rows.filter((r) => r.ifscaId != null && !existing.has(r.ifscaId));
    if (fresh.length) {
      const { data: inserted, error: insErr } = await supa
        .from("publications")
        .upsert(
          fresh.map((r) => ({
            kind,
            ifsca_id: r.ifscaId,
            title: r.title,
            publish_date: r.publishDate,
            file_url: r.fileUrl,
            desk,
          })),
          { onConflict: "kind,ifsca_id" }
        )
        .select("id, title, publish_date, file_url");
      if (insErr) throw insErr;

      for (const p of isFirstKind ? [] : inserted || []) {
        changes.push({
          change_type: "publication_added",
          desk,
          headline: `New ${KIND_LABEL[kind] || kind}: ${p.title}`,
          category: label,
          ref_table: "publications",
          ref_id: p.id,
          url: p.file_url || `/desk/${desk.toLowerCase()}`,
          detail: { publish_date: p.publish_date },
        });
      }
    }
    summary[kind] = { total: rows.length, added: fresh.length };
  }
  return summary;
}

function sezFmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Lifecycle: Scheduled (upcoming) -> Held (date passed, no minutes) -> Minutes Out.
function sezStatus(meetingDateIso, hasMinutes, todayIso) {
  if (hasMinutes) return "Minutes Out";
  if (meetingDateIso && meetingDateIso <= todayIso) return "Held";
  return "Scheduled";
}

function sezPrimaryLink(m, status) {
  if (status === "Minutes Out") return m.minutesUrl || m.agendaUrl || m.noticeUrl;
  return m.agendaUrl || m.noticeUrl || m.minutesUrl;
}

function sezHeadline(title, status, dateIso) {
  const d = sezFmtDate(dateIso);
  if (status === "Minutes Out")
    return `${title} — minutes published${d ? ` (met ${d})` : ""}: approvals granted`;
  if (status === "Held") return `${title} held${d ? ` on ${d}` : ""} — minutes awaited`;
  return `${title} scheduled${d ? ` for ${d}` : ""}`;
}

async function ingestSezMeetings(changes) {
  const meetings = await ifsca.fetchUacMeetings();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: existRows, error } = await supa
    .from("sez_meetings")
    .select("id, ifsca_id, status, notice_url, agenda_url, approval_url, minutes_url");
  if (error) throw error;
  const existing = new Map((existRows || []).map((r) => [r.ifsca_id, r]));
  const isFirst = existing.size === 0;

  const counts = { added: 0, statusChanges: 0, docsPublished: 0 };

  const pushEvent = (id, type, headline, url, m, extra = {}) =>
    changes.push({
      change_type: type,
      desk: "SEZ Approvals",
      headline,
      category: "SEZ / UAC",
      ref_table: "sez_meetings",
      ref_id: id,
      url: url || "/desk/sez",
      detail: { meeting_date: m.meetingDate, ...extra },
    });

  for (const m of meetings) {
    const status = sezStatus(m.meetingDate, !!m.minutesUrl, todayIso);
    const prev = existing.get(m.ifscaId);
    const row = {
      title: m.title,
      meeting_date: m.meetingDate,
      notice_url: m.noticeUrl,
      agenda_url: m.agendaUrl,
      approval_url: m.approvalUrl,
      minutes_url: m.minutesUrl,
      status,
      desk: "SEZ Approvals",
    };

    if (!prev) {
      const { data: ins, error: insErr } = await supa
        .from("sez_meetings")
        .insert({ ifsca_id: m.ifscaId, ...row })
        .select("id")
        .single();
      if (insErr) throw insErr;
      counts.added++;
      if (!isFirst) {
        pushEvent(
          ins.id,
          `sez_${status.toLowerCase().replace(/ /g, "_")}`,
          sezHeadline(m.title, status, m.meetingDate),
          sezPrimaryLink(m, status),
          m,
          { status }
        );
      }
      continue;
    }

    // Detect newly-published documents and status transitions.
    const gotAgenda = m.agendaUrl && !prev.agenda_url;
    const gotApproval = m.approvalUrl && !prev.approval_url;
    const statusChanged = !!prev.status && status !== prev.status;
    const docsChanged =
      m.noticeUrl !== prev.notice_url ||
      m.agendaUrl !== prev.agenda_url ||
      m.approvalUrl !== prev.approval_url ||
      m.minutesUrl !== prev.minutes_url;

    if (docsChanged || status !== prev.status) {
      await supa
        .from("sez_meetings")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", prev.id);
    }

    if (isFirst) continue; // silent baseline

    // Document-publication events (agenda / approval). Minutes are covered by
    // the status -> "Minutes Out" transition below to avoid a duplicate.
    if (gotAgenda) {
      counts.docsPublished++;
      pushEvent(
        prev.id,
        "sez_agenda_out",
        `Agenda published — ${m.title} (applicants up for approval)`,
        m.agendaUrl,
        m
      );
    }
    if (gotApproval) {
      counts.docsPublished++;
      pushEvent(
        prev.id,
        "sez_approval_out",
        `Agenda approved by circulation — ${m.title}`,
        m.approvalUrl,
        m
      );
    }
    if (statusChanged) {
      counts.statusChanges++;
      pushEvent(
        prev.id,
        `sez_${status.toLowerCase().replace(/ /g, "_")}`,
        sezHeadline(m.title, status, m.meetingDate),
        sezPrimaryLink(m, status),
        m,
        { from: prev.status, to: status }
      );
    }
  }
  return { total: meetings.length, ...counts, baseline: isFirst };
}

async function main() {
  const started = new Date();
  const { count } = await supa
    .from("entities")
    .select("id", { count: "exact", head: true });
  const isFull = !count || count === 0;
  console.log(`Ingest mode: ${isFull ? "FULL backfill" : "daily diff"} (entities in DB: ${count || 0})`);

  const { data: run } = await supa
    .from("ingest_runs")
    .insert({ kind: isFull ? "full" : "daily" })
    .select("id")
    .single();

  const changes = [];
  let entitySummary, pubSummary, sezSummary, ok = true, errMsg = null;
  try {
    entitySummary = await ingestEntities(isFull, changes);
    console.log(`Entities: +${entitySummary.added} added, ${entitySummary.removed} removed, ${entitySummary.statusChanges} status changes (of ${entitySummary.total})`);
    pubSummary = await ingestPublications(changes);
    console.log("Publications:", JSON.stringify(pubSummary));
    sezSummary = await ingestSezMeetings(changes);
    console.log("SEZ/UAC meetings:", JSON.stringify(sezSummary));

    // On the FULL backfill we do NOT flood the change log with ~2200 "new"
    // rows — that's the baseline, not news. Daily runs record everything.
    if (!isFull && changes.length) {
      // chunked insert
      for (let i = 0; i < changes.length; i += 500) {
        const { error } = await supa.from("changes").insert(changes.slice(i, i + 500));
        if (error) throw error;
      }
      console.log(`Logged ${changes.length} changes.`);
    } else if (isFull) {
      console.log(`Baseline established — ${changes.length} items seeded (not logged as changes).`);
    } else {
      console.log("No changes today.");
    }
  } catch (e) {
    ok = false;
    errMsg = e.message;
    console.error("INGEST ERROR:", e);
  }

  await supa
    .from("ingest_runs")
    .update({
      finished_at: new Date().toISOString(),
      ok,
      summary: { entitySummary, pubSummary, sezSummary, changeCount: changes.length, error: errMsg, seconds: (Date.now() - started) / 1000 },
    })
    .eq("id", run?.id);

  if (!ok) process.exit(1);
}

main();

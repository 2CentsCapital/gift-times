// Live market + weather ticker for the masthead.
// All sources are keyless and free. Fetches are cached (ISR) so we hit them at
// most a few times an hour, and every field fails soft — a dead source just
// drops that segment rather than breaking the masthead.

export type Quote = { level: number; changePct: number } | null;
export type Ticker = {
  weather: { tempC: number; sky: string } | null;
  nifty: Quote;
  usdinr: Quote;
};

// Gandhinagar / GIFT City.
const LAT = 23.22;
const LON = 72.68;

// WMO weather codes → short newspaper-style label.
function skyLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Fair";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Haze";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storm";
  return "Fair";
}

async function getWeather(): Promise<Ticker["weather"]> {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code`,
      { next: { revalidate: 1800 }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const c = j?.current;
    if (typeof c?.temperature_2m !== "number") return null;
    return { tempC: Math.round(c.temperature_2m), sky: skyLabel(c.weather_code ?? -1) };
  } catch {
    return null;
  }
}

// Yahoo Finance chart API — keyless. ^NSEI = NIFTY 50, USDINR=X = USD/INR spot.
async function getQuote(symbol: string): Promise<Quote> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 giftcitytimes" },
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    const level = m?.regularMarketPrice;
    const prev = m?.chartPreviousClose ?? m?.previousClose;
    if (typeof level !== "number" || typeof prev !== "number" || prev === 0) return null;
    return { level, changePct: ((level - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

export async function getTicker(): Promise<Ticker> {
  const [weather, nifty, usdinr] = await Promise.all([
    getWeather(),
    getQuote("^NSEI"),
    getQuote("USDINR=X"),
  ]);
  return { weather, nifty, usdinr };
}

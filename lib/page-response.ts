import { NextResponse } from "next/server";

// Small branded HTML page for email-action confirmations (confirm/unsubscribe).
export function actionPage(title: string, body: string, status = 200) {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <div style="font-family:Georgia,serif;max-width:520px;margin:14vh auto;padding:0 24px;color:#1a1712;text-align:center;">
    <div style="font:700 12px/1 Arial;letter-spacing:2px;text-transform:uppercase;color:#7a1f1f;">GIFT City Times</div>
    <h1 style="font-size:27px;margin:14px 0 10px;">${title}</h1>
    <p style="color:#4a453c;line-height:1.5;font-size:16px;">${body}</p>
    <p style="margin-top:26px;"><a href="/" style="font:600 13px Arial;color:#7a1f1f;text-decoration:none;">← Back to GIFT City Times</a></p>
  </div>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

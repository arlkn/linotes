// Render docs/social-preview.png (1280×640), the image GitHub shows when the repository is shared.
// Upload it in the repository's Settings → General → Social preview.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const icon = readFileSync('assets/linotes-icon.svg').toString('base64');
const html = `<!doctype html><html><body style="margin:0">
<div style="width:1280px;height:640px;display:flex;align-items:center;gap:64px;padding:0 96px;box-sizing:border-box;
  background:linear-gradient(135deg,#faf9f6 0%,#f3ede6 100%);font-family:'Ubuntu Sans','Ubuntu','Cantarell',sans-serif;color:#242424">
  <img src="data:image/svg+xml;base64,${icon}" style="width:360px;height:360px;flex:none">
  <div>
    <div style="font-size:96px;font-weight:700;letter-spacing:-2px">Linotes</div>
    <div style="font-size:36px;color:#c74616;font-weight:600;margin-top:8px">Your notes. Your Linux. Your data.</div>
    <div style="font-size:26px;color:#5f5f5f;margin-top:28px;line-height:1.45">Private, offline-first Markdown notes<br>for the Linux desktop. Free and open source.</div>
  </div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.setContent(html);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: 'docs/social-preview.png' });
await browser.close();
console.log('Saved docs/social-preview.png');

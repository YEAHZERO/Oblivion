#!/usr/bin/env node
/**
 * dsh-browser 登录态采集器（AuthProfile / storageState）。
 *
 * 用 dsh-browser 自带的 Playwright + 本机 Edge 打开平台登录页，**你自己**扫码/输密码
 * 登录成功后，脚本轮询会话 cookie；一旦出现就把 storageState（cookies + localStorage）
 * 原子写到输出路径，然后关窗退出。它不接触账号密码，只搬运浏览器已经拿到的 cookie。
 *
 * 生成的 JSON 会被写进 profile 补丁里 dsh-browser 的 authProfiles 条目，再由
 * dsh-web-search-pro 的 browserBindings.<platform>.authProfile 绑定到具体平台。
 *
 * 用法：
 *   node tools/dsh-browser-login.mjs zhihu
 *   node tools/dsh-browser-login.mjs weibo --timeout 15
 *   node tools/dsh-browser-login.mjs zhihu --out D:/secrets/zhihu.json
 *   node tools/dsh-browser-login.mjs zhihu --edge 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
 *
 * 选项：
 *   --timeout <分钟>     等待登录的上限，默认 10
 *   --channel <名字>     Playwright 通道，默认 msedge（与 dsh-browser 的 channel 保持一致）
 *   --edge <exe>         改用显式可执行文件（等价于 dsh-browser 的 executablePath）
 *   --out <文件>         输出路径，默认 $DSH_HOME/data/dsh-browser/auth/<平台>.json
 *   --playwright <目录>  playwright 包目录，默认 <profile>/node_modules/playwright
 *   --headless           无头（无法人工登录，只用于确认内核对不对）
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SITES = {
  zhihu: { label: '知乎', url: 'https://www.zhihu.com/signin', cookies: ['z_c0'], domains: ['zhihu.com'] },
  weibo: { label: '微博', url: 'https://weibo.com/login.php', cookies: ['SUB', 'SUBP'], domains: ['weibo.com', 'weibo.cn'] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[dsh-browser-login]', ...a);

function parseArgs(argv) {
  const out = { site: undefined, timeoutMin: 10, headless: false, channel: 'msedge', executable: undefined, playwright: undefined, output: undefined, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === '--timeout') out.timeoutMin = Number(next());
    else if (arg === '--channel') out.channel = next();
    else if (arg === '--edge') { out.channel = undefined; out.executable = next(); }
    else if (arg === '--out') out.output = next();
    else if (arg === '--playwright') out.playwright = next();
    else if (arg === '--headless') out.headless = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
    else rest.push(arg);
  }
  out.site = rest[0];
  return out;
}

function usage() {
  console.log('用法: node tools/dsh-browser-login.mjs <' + Object.keys(SITES).join('|') + '> [--timeout 分钟] [--channel msedge] [--edge <exe>] [--out <文件>] [--playwright <目录>] [--headless]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.site) { usage(); process.exit(args.site || args.help ? 0 : 1); }
  const site = SITES[args.site];
  if (!site) { console.error('未知平台: ' + args.site); usage(); process.exit(1); }
  if (!Number.isFinite(args.timeoutMin) || args.timeoutMin <= 0) { console.error('--timeout 必须是正数（分钟）'); process.exit(1); }

  const dshHome = (process.env.DSH_HOME ?? '').trim() || join(homedir(), '.dsh');
  const playwrightDir = args.playwright ?? join(dshHome, 'profiles', 'desktop', 'node_modules', 'playwright');
  if (!existsSync(playwrightDir)) {
    console.error('找不到 playwright 包目录: ' + playwrightDir + '\n用 --playwright <目录> 指定，或先安装 @anweat/dsh-browser。');
    process.exit(1);
  }
  const output = args.output ?? join(dshHome, 'data', 'dsh-browser', 'auth', args.site + '.json');

  const require = createRequire(import.meta.url);
  const { chromium } = require(playwrightDir);

  const launchOptions = { headless: args.headless };
  if (args.executable) launchOptions.executablePath = args.executable;
  else if (args.channel) launchOptions.channel = args.channel;

  log('平台: ' + site.label + '  ' + site.url);
  log('内核: ' + (args.executable ?? ('channel=' + args.channel)) + (args.headless ? ' (headless)' : ''));
  log('输出: ' + output);

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (error) {
    console.error('启动浏览器失败: ' + (error?.message ?? error));
    console.error('提示: 若报内核缺失，用 dsh-browser 的 runtime.install，或 --edge <msedge.exe> 指向本机 Edge。');
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((error) => log('导航警告（可继续）: ' + error.message));

  console.log('');
  console.log('>>> 在弹出的窗口里登录 ' + site.label + '（扫码或账号密码都可以）。');
  console.log('>>> 登录成功后不要关窗口，脚本每 2 秒检测一次会话 cookie，检测到就自动保存并关窗。');
  console.log('');

  const deadline = Date.now() + args.timeoutMin * 60_000;
  let found = [];
  let tick = 0;
  while (Date.now() < deadline) {
    await sleep(2000);
    tick += 1;
    const cookies = await context.cookies();
    found = site.cookies.filter((name) => cookies.some((c) => c.name === name && c.value));
    if (found.length > 0) break;
    if (tick % 15 === 0) {
      const left = Math.max(1, Math.round((deadline - Date.now()) / 60_000));
      log('仍在等待登录…（剩余约 ' + left + ' 分钟）');
    }
  }

  if (found.length === 0) {
    console.error('超时：' + args.timeoutMin + ' 分钟内没有检测到 ' + site.label + ' 的登录 cookie（' + site.cookies.join(' / ') + '）。');
    await browser.close();
    process.exit(2);
  }

  log('检测到登录 cookie: ' + found.join(', ') + '，等待站点写完其余状态…');
  await sleep(2000);
  mkdirSync(dirname(output), { recursive: true });
  await context.storageState({ path: output });
  const all = await context.cookies();
  const scoped = all.filter((c) => site.domains.some((d) => c.domain.replace(/^\./, '') === d || c.domain.replace(/^\./, '').endsWith('.' + d)));
  log('已保存 ' + output);
  log('总 cookie ' + all.length + ' 条，其中 ' + site.label + ' 作用域 ' + scoped.length + ' 条。');
  log('下一步：把该路径写进 profile 补丁 dsh-browser 的 authProfiles.' + args.site + '.storageStatePath，允许域 ' + site.domains.join(' / ') + '，并在 dsh-web-search-pro 的 browserBindings.' + args.site + '.authProfile 绑定同名 profile。');
  await browser.close();
}

await main();

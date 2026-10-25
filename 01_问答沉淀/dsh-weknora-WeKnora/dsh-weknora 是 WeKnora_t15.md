# dsh-weknora 是 WeKnora · 轮 15

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

重启不了，已经加入公钥

## 回答

两件事并行：推送（你已加公钥）+ 诊断 405。

关键判断：我的 handler 对**非 POST** 才返回 405，而浏览器发的是 POST —— 所以 405 很可能来自 DSH 的 webserver 本身，即**路由压根没注册**。用不带 Origin 的 POST 一测便知（若 handler 在跑，应返回 403 而不是 405）。

**推送成功了** ✅ `7798f71..924157f main -> main`，7 个提交全部上去了。

405 也定位了 —— 注意第三条：

| 请求 | 结果 |
|---|---|
| `POST /obl-brand/restart` | **405** |
| `GET /obl-brand/restart` | **404** |
| `POST /definitely-not-a-route-xyz`（不存在的路径） | **405** |

**不存在的路径 POST 也是 405** —— 说明这是 DSH webserver 对未注册路径的通用响应，**我的路由压根没注册**，不是方法判断出错。查 `ctx.inject` 在宿主侧是否可用。

`inject` 确实存在（cordis:1600），服务名也确认是 `webServer`。读 `inject` 的实现看签名是否如我所用。

`inject` 的语义确认无误（等于 `plugin({inject, apply})`）。那问题在更外层 —— 先找宿主日志，看插件到底有没有被挂载、`apply` 有没有跑。

日志目录是空的（只放崩溃报告）。换个更有力的判据 —— 宿主重启时会把组合结果回写到 `cordis.yml`。看它是否变新、是否含我的插件行。

`cordis.yml` 变成 **223 字节**了 —— 那是 DSH 的「空根」（每次启动重写为空），不是组合树。所以它只告诉我**应用在 21:12 重启过一次**。对时间线：

**根因确认了**（时间线完全对上）：

| 事件 | 时间 |
|---|---|
| 应用启动（`cordis.yml` 被重写为空根） | **21:12:00** |
| 我构建出新产物 | **22:50:12** |

**node 半边是启动时加载的，浏览器页面是刷新时加载的。** 你刷新了页面 → 拿到新的客户端 UI（所以看得到「应用重启」）；但宿主里跑的还是 21:12 那份**旧的空 `apply()`** → 路由没注册 → 405。**这是先有鸡还是先有蛋**：按钮要靠新 node 半边，新 node 半边要靠重启。

不过在让你白重启一次之前，我必须排掉另一个**会让重启后照样失败**的隐患：桌面窗口的页面来源可能不是 `http://127.0.0.1` 而是 `dsh-app://app`。

**两个决定性发现**：

1. 市场的 `api()` 返回的是**相对 pathname**（`new URL(relative, document.baseURI).pathname`）—— 说明页面来源取决于 `document.baseURI`。
2. `main.js` 里两处校验写死了 `origin !== "dsh-app://app"` —— **桌面窗口的页面来源就是 `dsh-app://app`，不是 `http://127.0.0.1`**。

这意味着我的 `fetch('/obl-brand/restart')` 会打到 `dsh-app://app/...`，而且 `fromLoopback` 会因来源不符直接 403。看协议处理器是否把请求转发给 webserver。

**转发机制找到了**（`main.js:11548`）：

```js
if (url.hostname === "app") {
  if (pathname 是文档/资源) return serveWebDocument(...)
  return forwardWebRequest(request, hostUrl, hostCookie);   // ← 其余全部转发给本地 webserver
}
```

所以 `fetch('/obl-brand/restart')` → `dsh-app://app/obl-brand/restart` → **会被转发到 webserver**，传输层是通的。剩下唯一的未知是 `Origin` 头是否被改写 —— 这决定我的回环校验会不会误拒。

**找到让重启后照样失败的第二处缺陷。** `forwardWebRequest`（`main.js:7461`）在转发前把这个头**删掉了**：

```js
if (origin !== null && origin !== "dsh-app://app") return new Response(null, { status: 403 });
for (const name of ["host", "origin", "cookie", "sec-fetch-site"]) headers.delete(name);
headers.set("cookie", cookie);
```

也就是说到达我路由时 **`Origin` 是缺失的**，而我的 `fromLoopback()` 要求它必须是字符串 → 会返回 **403**。我把桌面端和浏览器两种路径的校验重写。

加一条 `info` 日志，下次能直接从日志确认路由是否挂载。

构建通过。把 `origin` 切到 SSH（HTTPS 在本机完全不可用），提交并推送。

推送到位了 ✅ 远程 HEAD = 本地 HEAD = `93b077f`，工作树干净。**8 个提交全部同步完成**，`origin` 也已切到 SSH（HTTPS 在本机完全不可用，现在 `git push` 直接可用）。

## 405 的根因：不是 bug，是先有鸡还是先有蛋

时间线对得严丝合缝：

| 事件 | 时间 |
|---|---|
| 应用启动（`cordis.yml` 被重写为空根） | **21:12:00** |
| 我构建出新产物 | **22:50:12** |

**node 半边在应用启动时加载，浏览器页面在刷新时加载。** 你刷新页面 → 拿到了新的客户端 UI（所以看得到「应用重启」按钮）；但宿主里跑的还是 21:12 那份**旧的空 `apply()`** → 路由没注册。

判据很硬：`POST` 到**不存在的路径**也返回 405 —— 这是 webserver 对未注册路径的通用响应，说明我的 handler 根本没参与。

**所以你需要手动重启一次 DSH**（这次只能手动，按钮本身要靠新 node 半边才能工作）。之后这个按钮就自举了。

## 但在让你白重启之前，我查出第二处会让重启后照样失败的缺陷

如果只是上面那条，重启后就能用。问题是**还有一处**：

桌面窗口的页面来源是 **`dsh-app://app`**，不是 `http://127.0.0.1`。非文档路径经 `forwardWebRequest` 转发给本地 webserver，而它在转发前**把这个头删掉了**：

```js
if (origin !== null && origin !== "dsh-app://app") return new Response(null, { status: 403 });
for (const name of ["host", "origin", "cookie", "sec-fetch-site"]) headers.delete(name);
headers.set("cookie", cookie);
```

所以请求到达我的路由时 **`Origin` 是缺失的**，而我的 `fromLoopback()` 要求它必须是字符串 → 会返回 **403**。**原判据会把桌面端自己的合法请求拒之门外。**

已重写为按真实威胁模型判断：

| 情况 | 处置 | 理由 |
|---|---|---|
| Origin 缺失 | ✅ 放行 | 桌面转发路径；只有非浏览器调用方会这样，而本地进程本就能直接杀进程，不增加暴露面 |
| `dsh-app://app` | ✅ 放行 | 桌面窗口来源 |
| `http(s)://127.0.0.1` / `localhost` | ✅ 放行 | 浏览器直连回环 |
| 其它任何来源 | ❌ 403 | 浏览器对**跨源 POST 一定会带 Origin**，这就是挡 CSRF 的那道闸 |

顺带加了条 `info` 日志（`重启路由已挂载：POST /obl-brand/restart`），下次能直接从日志确认挂载状态。

## 现在请你做

**手动重启一次 DSH**（关掉再打开）。然后：

**设置 → Oblivion 品牌 → 应用重启 → 重启 DSH → 确认**

预期：应用自己关掉再起来。点下去后**页面断连是正常的** —— 那是应用真被杀了。

如果还不行，两个排查点：

1. `%TEMP%\obl-brand-restart.log` —— 里面记录了完整祖先链和最终锁定的 PID
2. 控制台（F12）里 `obl-brand` 的报错，以及 `POST /obl-brand/restart` 的状态码：
   - **403** → 来源校验，说明还有我没覆盖的调用路径
   - **405** → 路由仍未注册，node 半边还是旧的（没重启成功）
   - **500** → helper 派生失败
   - **202** → 路由通了，问题在 helper 内部，看日志

---

补一句关于这次的教训：**这个功能我没法在提交前端到端验证**，因为验证它就需要重启应用、而重启应用就会中断我这个会话。所以我把能离线验的都验了（身份判据在真实进程树上干燥运行），但传输层和来源校验只能靠读 DSH 源码推断 —— 事实证明那里正好藏着第二个坑。这类"改完必须重启才能验证"的功能，本质上只能靠一轮实测收敛。

- 涉及工具: `edit`, `pwsh`

---
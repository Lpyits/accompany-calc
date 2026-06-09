// ── Webhook 推送模块 ──
// 静默推送：失败不弹窗、不报错、不阻塞主流程
// 连续失败 5 次后自动关闭，重启清零

const WEBHOOK_URL =
  "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=83476fcd-3b1e-4ebf-af33-9343f28bcdf4";

const MAX_CONSECUTIVE_FAILURES = 5;
const REQUEST_TIMEOUT_MS = 5000;

let consecutiveFailures = 0;
let pushDisabled = false;

/** 获取公网 IP，失败返回 "未知" */
async function getPublicIp(): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.ipify.org?format=text", {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return "未知";
    return (await res.text()).trim();
  } catch {
    return "未知";
  }
}

/** 发送 Webhook 消息（非阻塞，静默处理所有异常） */
function sendWebhook(content: string): void {
  if (!content) return;
  const body = JSON.stringify({
    msgtype: "markdown",
    markdown: { content },
  });

  // 使用 fetch + AbortController 实现超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: controller.signal,
    mode: "no-cors", // 绕过 CORS 拦截，企业微信不返回 Access-Control-Allow-Origin
  })
    .then(() => {
      clearTimeout(timer);
      consecutiveFailures = 0; // 请求已发出，重置计数
    })
    .catch(() => {
      clearTimeout(timer);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        pushDisabled = true;
      }
    });
}

/** 格式化时间为 YYYY-MM-DD HH:mm:ss */
function formatTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * 统一推送入口（非阻塞）
 * @param action 操作类型（中文）
 * @param detail 操作详情
 */
export function push(action: string, detail: string): void {
  if (pushDisabled) return;

  // 非阻塞：用 setTimeout 0 让出主线程，内部 catch 所有异常
  setTimeout(async () => {
    try {
      const ip = await getPublicIp();
      const content =
        `## 陪玩系统通知\n` +
        `> 操作：<font color="info">${action}</font>\n` +
        `> 时间：${formatTime()}\n` +
        `> IP：${ip}\n` +
        `> 详情：${detail}`;
      sendWebhook(content);
    } catch {
      // 绝对静默
    }
  }, 0);
}

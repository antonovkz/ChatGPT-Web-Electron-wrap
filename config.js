const defaultUrl = 'https://chatgpt.com';
const defaultProxy = 'socks5://127.0.0.1:1080';
const defaultUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const defaultBackgroundColor = '#212121';
const appName = 'ChatGPT';
const whitelist = [
  "openai.com",
  "chatgpt.com"
];

module.exports = {
  whitelist,
  defaultUrl,
  defaultProxy,
  defaultUserAgent,
  defaultBackgroundColor,
  appName
};
# 接续 Oblivion 插件开发 · 轮 7

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

检查为何agnes使用官方API不能用：处理失败
本轮运行失败agnes-api API error (400): {"message":"***.BadRequestError: OpenAIException - {\"error\":{\"message\":\"Invalid JSON data: Failed to deserialize the JSON body into the target type: input: data did not match any variant of untagged enum ResponseInput at line 1 column 245444\",\"type\":\"invalid_request_error\",\"code\":\"json_parse_error\"}}","type":"invalid_request_error","param":"","code":"400"}
INVALID_REQUEST
本轮费用
没有完整用量记录

## 回答

错误关键：`at line 1 column 245444`——JSON body 在第 245444 列位置解析失败，说明**请求体已经相当大了**。先看具体是什么打坏了。

关键线索：session 文件超过 3.9MB，错误发生在 column 245444（第 245K 字符处）。看一下当前活跃会话内容和配置。

继续调查。关键线索在 DSH 源码里——它是怎么把会话消息转换成发给 agnes API 的请求体的。

- 涉及工具: `job_kill`, `pwsh`, `write`

---
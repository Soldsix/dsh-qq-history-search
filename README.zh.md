---
description: "通过宿主服务或可选的原生模型工具检索授权的会话归档。"
kind: "package-bundle"
---
# dsh-qq-history-search

[English](README.md) | 中文

## 概要

在指定归档中按原文检索，校验请求者权限，限制资源并加密分页游标。存储由归档插件管理。可选原生工具将请求者绑定到当前已认证的聊天轮次，拒绝模型自选身份和群内共享模型会话。检索与工具初始均关闭；当前提供原文检索，不是语义检索或自动长期记忆。

## 目录

- [安装](#install)
- [权限](#authorization)
- [原生模型工具](#native-model-tool)
- [检索行为](#query-behavior)
- [验证与限制](#verification-and-limits)

<a id="install"></a>
## 安装

使用 DSH 0.2.2-rc.1 与 Cordis ~4.1.0。原生 profile 要求 Node >=24.9；库层检查也覆盖 Node 22.19。先安装归档 bundle，再安装本包；公共库依赖自动获取。归档需单独开启、明确选择会话并设置 `readEnabled: true`。检索等待 `qqArchive`，提供方移除时停止；不安装独立程序或单独服务器。

```sh
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-archive/releases/download/v0.2.1/dsh-qq-archive-0.2.1.tgz
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-history-search/releases/download/v0.3.0-development/dsh-qq-history-search-0.3.0-development.tgz
```

原生所有者页面提供全部会话选择、管理员、资源及工具设置。配置版本校验保留无效草稿，更新要求查询空闲；状态显示查询数量和工具就绪情况，不含消息正文。设置保存在 DSH profile 中。

<a id="authorization"></a>
## 权限

宿主调用者将 `requester` 和 `scope` 绑定到已认证事件。普通成员只能查询指定会话中自己的原文。管理员明确绑定租户、网络、机器人账号与用户，可在该会话内选择其他成员或全部成员。各选择列表取交集，不构成账号与群的配对；归档服务还会独立校验自己的选择。

宿主调用者负责输出受众。模型工具结果可能用于群内公开回复，并非私密投递功能。同进程宿主插件与本机管理员是受信任代码；本插件不能沙箱化恶意宿主代码。存储加密与保留策略由归档所有者管理。

<a id="native-model-tool"></a>
## 原生模型工具

安装 dsh-qq-chat 0.3.0-development 或兼容的 `imRequests` 提供方。在 Chat 开启 `isolateGroupSenders`，把 `qq_history_search` 加入 `allowedTools`，再开启 History 的 `toolsEnabled`。设置页面拒绝缺少来源提供方或共享群会话的配置。手动配置为共享群会话时保留宿主检索，状态报告 `sender-isolation-required`，不注册模型工具。

工具接受 `query` 及可选的 `limit`、`sender`、`allSenders`、`before`。会话、请求者和执行身份不由模型传入。必须以当前真实 `exec.agent` 对象查询已接纳来源；复制对象、agent ID、既存会话元数据和本地试用均无权查询。取消、卸载或来源替换会撤销待完成查询，撤销后返回的结果被拒绝。

规范结果包含 `status`、`reason`、`matches`、`partial`、`next`。每条匹配含发送者、消息 ID、时间、文字、非文字标志和截断标志。摘录共用 `toolTextChars` 总预算并遵守 `toolMatchChars`；`toolMaxResults` 不能超过宿主结果上限。截断保留完整 Unicode 字符，不改原始归档。会话工具结果事件记录模型可见输出。原生客户端使用通用检索卡片，Web 使用通用工具展示。归档原文是不受信任的数据，不是新的指令。

私人检索结果不得留在群内共享模型会话中。成员隔离会话防止下一位参与者继承结果；开启隔离会保留旧共享日志并启用独立历史。当前不会注入公开共享话题，也不会自动删除此前已共享的结果。开启私人检索后，如需改回共享会话，应另行审查保留的模型上下文。

<a id="query-behavior"></a>
## 检索行为

`qqHistorySearch.search(request, signal)` 跨文字段匹配区分大小写的 Unicode 原文子串，不识别别名或图像内容。宿主返回完整匹配文字，不含附件引用或字节；模型工具返回有上限的摘录。有限扫描的空结果不能证明整个归档不存在该信息。`partial` 表示跳过记录或截断摘录，`next` 表示仍有下一页。

限制覆盖扫描条数与字节、返回条数与字节、单条记录大小、并发和截止时间，归档所有者可以施加更严格的上限。加密游标绑定会话、请求者、发送者过滤和关键词，重启后失效。卸载取消并等待本插件查询完成，不关闭归档或中断其他使用者；本插件不接受数据库路径。

<a id="verification-and-limits"></a>
## 验证与限制

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm pack --pack-destination artifacts
npm run test:consumer
npm run test:native
npm run test:model
npm run test:browser
npm run test:web
```

测试采用合成身份和隔离 profile。模型测试让真实 DSH 适配器与工具执行器调用受控回环 HTTP 响应，不评估语义回忆，也不调用真实模型 API。不得将这些测试指向正式记录；不宣称已完成真实 QQ 客户端验收。

## 模型体验

配置的模型可选择可选工具。注册后，允许的工具集合可展示其定义，但执行必须属于授权的真实聊天轮次；手动或未绑定调用被拒绝。返回原文匹配，并区分拒绝与部分结果。目前不实现自动记忆选择、语义排序或自然共享话题回忆。

## 已知限制与后续工作

不提供跨会话模型检索、语义向量、日期范围查询、附件识别、自动事实纠错、长期记忆整理或输出收件人控制。通用工具卡片不是归档浏览器。隐私测试使用受控样例，不能证明防止所有模型泄露。

## 开发说明

SQLite 由归档公共服务管理，本包负责权限和模型摘录。`dsh-im-requests` 只提供当前来源绑定；消息使用者负责来源接纳和模型历史隔离。新增来源或结果数据必须能够从原生会话事件重建。

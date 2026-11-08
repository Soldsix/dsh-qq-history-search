# dsh-qq-history-search

通过 `dsh-qq-archive` 的公开 Host 服务提供按需启用的受限历史检索。SQLite 全部由归档插件访问；本插件负责请求者权限、查询预算和加密分页。不接受数据库路径，不注册模型工具、QQ 指令或自动记忆系统。

## 安装

```sh
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-archive/releases/download/v0.2.1/dsh-qq-archive-0.2.1.tgz
dsh plugin --profile MY_PROFILE add https://github.com/Soldsix/dsh-qq-history-search/releases/download/v0.2.1/dsh-qq-history-search-0.2.1.tgz
```

库依赖自动下载；归档 bundle 需要单独启用、选择会话并设置 `readEnabled: true`。历史搜索等待其 `qqArchive` 服务，服务卸载时停止。两项 bundle 初始均关闭。适配 DSH 0.2.2-rc.1、Cordis ~4.1.0、Node ^22.19 或 >=24。

## 权限

可信 Host 代码必须把 `requester` 和 `scope` 绑定到经过认证的实际消息，不能让模型自行指定。普通成员只能查询选定会话内自己的文字；明确配置的管理员可以查询其他发送者或全部发送者。管理员绑定到确切的租户、网络、机器人账号和用户 ID。调用方还必须另行判断查询结果能否披露给回复的接收者。

范围列表取交集，不代表账号与群逐一配对；默认不开放会话。归档服务会再次校验自身会话选择。同进程插件和本机管理员视为可信，此 API 不能限制恶意 Host 代码。本预览不向 LLM 直接开放查询。

```yaml
- id: qq-archive
  config:
    enabled: true
    readEnabled: true
    tenants: [example-tenant]
    accounts: [example-account]
    groups: [example-group]
- id: qq-history-search
  config:
    enabled: true
    tenants: [example-tenant]
    networks: [onebot11]
    accounts: [example-account]
    groups: [example-group]
    operators:
      - tenant: example-tenant
        network: onebot11
        account: example-account
        user: example-admin
```

把所有示例 ID 替换为经过认证的传输身份。不需要跨成员查询时省略 `operators`。存储位置只在归档插件配置；未发布原型中的历史搜索 `directory` 设置已移除，存储记录和数据库版本均不变。

## 查询行为

`qqHistorySearch.search(request, signal)` 对文字片段执行区分大小写的 Unicode 子串匹配，不识别别名、不搜索图片内容。受限扫描的空页不能证明全部历史不存在相关内容。返回完整文字，不含附件引用或文件本体。`partial: true` 表示超大记录或结果被跳过，`next` 表示可以继续翻页。

限制包括扫描条数与字节、返回条数与字节、单条字节、并发数和时间；归档所有者更严格的上限同样生效。加密游标绑定会话、请求者、发送者筛选和查询词，重启服务后失效。调用方取消或超时只结束该次查询。卸载等待自身查询结束，不关闭归档，不中断写入或其他使用方。

原生所有者页面支持带版本校验的会话、管理员和上限配置。修改前需查询空闲，更新期间暂停接收新查询；重启后旧游标失效。运行计数不含消息正文。归档文件的安全、加密和保留期限由存储所有者负责。

## 开发与预览范围

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm pack --pack-destination artifacts
npm run test:native
npm run test:browser
npm run test:web
```

测试使用虚构身份和全新 profile，不得指向生产记录。本预览只提供 Host 查询服务；经过身份认证的 QQ/模型适配、公开回复隐私、语义记忆、自然回忆及真实 QQ/桌面验收仍需分别完成。

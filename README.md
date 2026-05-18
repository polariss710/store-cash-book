# 店铺记账系统

当前版本：v65

## 项目说明

本系统用于店铺日常记账、现金数量统计、非现金收入记录、手续费统计、数据迁移、工资结算和月度报表输出。

项目最初为本地记账工具，现已升级为 Supabase 云端同步版，可在 PC、iPad、手机端使用。

## 技术栈

- HTML
- CSS
- JavaScript
- GitHub Pages
- Supabase Auth
- Supabase Database

## 部署地址

GitHub Pages：

```text
https://polariss710.github.io/store-cash-book/
```

测试新版时可使用：

```text
https://polariss710.github.io/store-cash-book/index.html?v=56
```

## 当前主要功能

### 登录与权限

- Supabase Auth 登录
- 用户名登录
- admin / staff 权限区分
- 登录页显示当前版本号
- 10 分钟无操作自动退出
- 支持退出当前设备 / 退出所有设备

### 每日记账

- 每日现金数量录入
- PayPay / 积分 / 信用卡录入
- 现金净收入计算
- 找零差异计算
- 净收入拿走方案
- 备用金兑换建议
- 保存当天数据后提示并返回月份页面
- 数据迁移到指定日期

### 月度统计与报表

- 月度现金收入合计
- PayPay / 积分 / 信用卡合计
- 手续费前总收入
- 手续费合计
- 手续费后总收入
- 月度 CSV 导出
- 内嵌月度报表
- 报表打印 / 另存为 PDF
- 月度报表导出次数云端同步

### 全局设置

- PayPay 手续费率
- 积分手续费率
- 信用卡手续费率
- 高级数据操作
  - 导出本月系统备份
  - 导入系统备份

### 工资结算

- 新增人员卡片
- 人员标签切换
- 每个人员显示当月所有日期
- 按日录入：
  - 工资
  - 交通费
  - 备注
- 按人员保存本月工资数据
- 本月工资汇总
- 本月交通费汇总
- 本月工资总支出

## 权限设计

### admin

- 可使用全部功能
- 可进入全局设置
- 可进行数据迁移
- 可删除当天数据
- 可使用工资结算
- 可导入系统备份
- 可查看所有统计与报表

### staff

- 可登录
- 可录入每日数据
- 可保存每日数据
- 可进行数据迁移
- 不显示全局设置
- 不显示备用金预估
- 不使用工资结算

## Supabase 表

当前主要业务表：

```text
shop_stores
shop_profiles
shop_daily_records
shop_monthly_report_exports
shop_salary_staff
shop_salary_daily_records
```

历史保留表：

```text
shop_reserve_cash
shop_exchange_logs
shop_reserve_rebalance_logs
```

历史备用金相关表暂时保留，不建议马上删除。

## SQL 文件

仓库中保留的 SQL 文件包括：

```text
v43-supabase-migration.sql
v47-rename-tables-to-shop-prefix.sql
v48-fix-shop-prefix-and-rebalance-log.sql
v51-optional-reserve-cleanup-note.sql
v53-salary-module.sql
```

## 缓存刷新规则

每次发布新版本，需要修改 `index.html` 中的版本号：

```html
<link rel="stylesheet" href="style.css?v=56" />
<script src="app.js?v=56" defer></script>
```

手机主屏幕 Web App 如果没有更新，可用 Safari / Chrome 打开：

```text
https://polariss710.github.io/store-cash-book/index.html?v=56
```

确认新版正常后，再重新添加到主屏幕。

## 更新记录

### v65

- 收支汇总保存支出设置后，提示并自动回到页面顶部
- 方便保存后立即查看本月净收入


### v64

- 收支汇总的支出金额输入框默认显示为空，不再自带 0
- 工资结算的空金额输入框默认显示为空，不再自带 0
- 计算和保存时仍然把空白按 0 处理


### v63

- 修正 iPad 数字输入兼容问题，将关键数字输入改为 text + inputmode numeric
- 新增收支汇总页面
- 新增月度支出分类：房租、水电、网络、广告、日常杂费
- 自动计算净收入：手续费后总收入 - 工资总支出 - 其他支出
- 数据迁移取消最终输入 MIGRATE，确认对话框确定后直接迁移


### v62

- 修复工资明细 PDF 开头打印出「一键导出所有人员工资PDF」按钮的问题
- 打印工资明细时隐藏保存、删除、导出等操作控件


### v61

- 修复工资明细 PDF 最后一页底部仍显示深色背景的问题
- 打印工资明细时强制使用白色页面背景
- 调整打印模式清理时机，避免浏览器生成预览时恢复网页背景


### v60

- 工资明细 PDF 打印时底部背景改为白色
- 保留工资明细标题栏和表头主题色
- 保留单个人员工资 PDF 导出
- 保留一键导出所有人员工资 PDF


### v59

- 修复保存该人员本月数据函数未定义的问题
- 工资卡片上方统计在输入时实时更新


### v58

- 修复人员工资明细 PDF 导出函数未定义的问题
- 工资结算增加一键导出所有人员工资 PDF


### v57

- 全局设置中彻底移除确认已整理备用金按钮
- 工资结算新增当前人员工资明细 PDF 导出
- 保存当天数据按钮和删除当天数据按钮间距缩小
- 数据迁移增加启用 checkbox
- 数据迁移增加最终确认输入 MIGRATE


### v56

- 登录界面用户名输入框和密码输入框宽度调整为与登录按钮一致
- 新增 README.md
- 登录页版本号升级为 v56

### v55

- 工资结算画面删除单独录入日期
- 人员以标签形式显示
- 人员卡片内显示当月所有日期
- 可按日输入工资、交通费、备注
- 每个人员按月保存工资数据

### v54

- 保存当天数据成功后提示
- 点击确认后返回月份页面

### v53

- 新增工资结算页面初版
- 删除备用金状态 / 备用金内部整理建议
- 数据迁移对 staff 开放

### v52

- 每日记录增加步骤3
- 登录页显示当前版本号

### v51

- 简化备用金业务流程
- 删除备用金库存设置相关前端功能
- 增加数据迁移

### v50

- staff 隐藏备用金预估

### v49

- 日期显示日本星期形式

### v48

- 修正 shop_ 前缀重复问题

### v47

- 数据库表名统一增加 shop_ 前缀

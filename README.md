# Smark / 阅记

产品名称：阅记/Smark

## 1.页面布局

[墨刀制作的思维导图](https://modao.cc/board/share/XwaixF2CtcozzdfpHnRdb)
核心功能涉及

### UI设计

AI在线生成平台
对于小白，AIUI设计只能提供页面相关的布局方向，真正的页面交互还是需要自己在专业的UI交互软件进行搭建，可控性更高，因为这样才能更好地逻辑自洽。下面进行专业打分，满分10分
1、[Stitch](https://stitch.withgoogle.com/projects/17313191523047679250) //能够修改，针对这个项目，美学效果较高。9
2、[Lovart](https://www.lovart.ai/canvas?utm_source=index&utm_campaign=1&projectId=c4516b13b11a45bb8615c89e59d5a8f5) //AI生成有积分限制，美学效果一般。8
3、[lovable](https://lovable.dev/projects/b24fe8fb-354d-444d-841a-daf5132403df) //每天应该是10美元的限制，出代码交互还行，美学效果高于lovart。9
*最终是结合lovable给出了一个较为满意的页面逻辑。
4、[墨刀原型](https://modao.cc/proto/Eif4tWiptcg5a3liDrdGyz/sharing?view_mode=read_only&screen=rbpVErmSRVAZwsjnF) //AI积分限制，且没做出交互原型，后续所有的交互原型设计均在墨刀原型中进行。8
⚠️所有页面均为Android原生风格,适配手机竖屏，具体内容见墨刀原型。

## 2.核心功能

1.0功能
1、文章搜集，网页内容导入。
2、卡片记忆，长按文本划线，标记关键知识点，卡片展示。
Android 专属学习阅读工具。
1.0涉及的核心页面。
   导入页-手动输入页
   首页
   首页的阅读页
   首页的交互页
   复习页

## 3.版本说明

x.y.z，x为重大架构变更，y为功能新增，z为bug修复。
main为主分支，稳定可发布
develop为开发分支，可能存在bug。
feature为特性分支，开发新功能，可能存在bug。
fix为bug修复分支。

## Misskey Fork for DMIs 

[![Publish Docker image (neko)](https://github.com/ybw2016v/misskey/actions/workflows/docker-neko.yml/badge.svg)](https://github.com/ybw2016v/misskey/actions/workflows/docker-neko.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/dogcraft/misskey?color=7fbbff&logo=docker)](https://hub.docker.com/r/dogcraft/misskey)

### 一点点微小的改动

(包括但不限于)

* 将`package.json`中的github的https协议替换为ssh协议，安排好ssh公钥后即可在不稳定的网络情况下顺利安装。

* 将主题色由绿色改为蓝色。

* 对登录用户与非登录用户提供差异化内容，精准服务各类人群。

* 将无法加载(404、超时等)的头像替换为默认的未知头像

* 将无法加载(404、超时等)的`favicon.ico`替换为默认的未知头像

* 将无法加载(404、超时等)的图片替换为自定义的404图片

### Docker镜像

目前用action自动构建docker镜像

```bash
docker pull dogcraft/misskey
```

********************************************************************************

<div align="center">
<a href="https://misskey-hub.net">
	<img src="./assets/title_float.svg" alt="Misskey logo" style="border-radius:50%" width="400"/>
</a>

**🌎 **[Misskey](https://misskey-hub.net/)** is an open source, decentralized social media platform that's free forever! 🚀**

---

<a href="https://misskey-hub.net/instances.html">
		<img src="https://custom-icon-badges.herokuapp.com/badge/find_an-instance-acea31?logoColor=acea31&style=for-the-badge&logo=misskey&labelColor=363B40" alt="find an instance"/></a>

<a href="https://misskey-hub.net/docs/install.html">
		<img src="https://custom-icon-badges.herokuapp.com/badge/create_an-instance-FBD53C?logoColor=FBD53C&style=for-the-badge&logo=server&labelColor=363B40" alt="create an instance"/></a>

<a href="./CONTRIBUTING.md">
		<img src="https://custom-icon-badges.herokuapp.com/badge/become_a-contributor-A371F7?logoColor=A371F7&style=for-the-badge&logo=git-merge&labelColor=363B40" alt="become a contributor"/></a>

<a href="https://discord.gg/Wp8gVStHW3">
		<img src="https://custom-icon-badges.herokuapp.com/badge/join_the-community-5865F2?logoColor=5865F2&style=for-the-badge&logo=discord&labelColor=363B40" alt="join the community"/></a>

<a href="https://www.patreon.com/syuilo">
		<img src="https://custom-icon-badges.herokuapp.com/badge/become_a-patron-F96854?logoColor=F96854&style=for-the-badge&logo=patreon&labelColor=363B40" alt="become a patron"/></a>

---

[![codecov](https://codecov.io/gh/misskey-dev/misskey/branch/develop/graph/badge.svg?token=R6IQZ3QJOL)](https://codecov.io/gh/misskey-dev/misskey)

</div>

<div>

<a href="https://xn--931a.moe/"><img src="https://github.com/misskey-dev/misskey/blob/develop/assets/ai.png?raw=true" align="right" height="320px"/></a>

## ✨ Features
- **ActivityPub support**\
Not on Misskey? No problem! Not only can Misskey instances talk to each other, but you can make friends with people on other networks like Mastodon and Pixelfed!
- **Reactions**\
You can add emoji reactions to any post! No longer are you bound by a like button, show everyone exactly how you feel with the tap of a button.
- **Drive**\
With Misskey's built in drive, you get cloud storage right in your social media, where you can upload any files, make folders, and find media from posts you've made!
- **Rich Web UI**\
	Misskey has a rich and easy to use Web UI!
	It is highly customizable, from changing the layout and adding widgets to making custom themes.
	Furthermore, plugins can be created using AiScript, an original programming language.
- And much more...

</div>

<div style="clear: both;"></div>

## Documentation

Misskey Documentation can be found at [Misskey Hub](https://misskey-hub.net/), some of the links and graphics above also lead to specific portions of it.

## Sponsors

<div align="center">
	<a class="rss3" title="RSS3" href="https://rss3.io/" target="_blank"><img src="https://rss3.mypinata.cloud/ipfs/QmUG6H3Z7D5P511shn7sB4CPmpjH5uZWu4m5mWX7U3Gqbu" alt="RSS3" height="60"></a>
</div>

## Thanks

<a href="https://www.chromatic.com/"><img src="https://user-images.githubusercontent.com/321738/84662277-e3db4f80-af1b-11ea-88f5-91d67a5e59f6.png" height="30" alt="Chromatic" /></a>

Thanks to [Chromatic](https://www.chromatic.com/) for providing the visual testing platform that helps us review UI changes and catch visual regressions.

<a href="https://about.codecov.io/for/open-source/"><img src="https://about.codecov.io/wp-content/themes/codecov/assets/brand/sentry-cobranding/logos/codecov-by-sentry-logo.svg" height="30" alt="Codecov" /></a>

Thanks to [Codecov](https://about.codecov.io/for/open-source/) for providing the code coverage platform that helps us improve our test coverage.

<a href="https://crowdin.com/"><img src="https://user-images.githubusercontent.com/20679825/230709597-1299a011-171a-4294-a91e-355a9b37c672.svg" height="30" alt="Crowdin" /></a>

Thanks to [Crowdin](https://crowdin.com/) for providing the localization platform that helps us translate Misskey into many languages.

<a href="https://hub.docker.com/"><img src="https://user-images.githubusercontent.com/20679825/230148221-f8e73a32-a49b-47c3-9029-9a15c3824f92.png" height="30" alt="Docker" /></a>

Thanks to [Docker](https://hub.docker.com/) for providing the container platform that helps us run Misskey in production.

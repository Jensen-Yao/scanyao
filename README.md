<p align="center">
  <img src="public/brand/scanyao-logo.jpg" width="220" alt="ScanYao logo" />
</p>

<h1 align="center">扫耀 ScanYao</h1>

<p align="center">小而清晰的本地文档扫描器，支持 Windows、Android 与浏览器。</p>

<p align="center">
  <a href="https://github.com/Jensen-Yao/scanyao/actions/workflows/pages.yml"><img alt="Pages" src="https://github.com/Jensen-Yao/scanyao/actions/workflows/pages.yml/badge.svg" /></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-1d1d1f" />
  <img alt="Platforms" src="https://img.shields.io/badge/platform-Windows%20%7C%20Android-0a84ff" />
</p>

## 体验与下载

- 在线版 / GitHub Pages：<https://jensen-yao.github.io/scanyao/>
- Windows：从 [Releases](https://github.com/Jensen-Yao/scanyao/releases) 下载 `ScanYao-win-x64.zip`
- Android：从 [Releases](https://github.com/Jensen-Yao/scanyao/releases) 下载 `ScanYao-android-debug.apk`

Windows 默认包约 7 MB，采用 .NET 8 框架依赖发布。运行
`Start-ScanYao.ps1` 时若缺少 .NET 8 Desktop Runtime，会先询问并打开微软
官方下载页，不会静默安装。WebView2 缺失时应用也会给出提示。

## 功能

- 拍照、相册导入、桌面拖放与多页管理
- 自动建议文档边缘，四角可独立拖动微调
- 纯 TypeScript 四点透视校正与双线性采样
- 原图、净化、增强、灰度、黑白五种滤镜
- 滤镜强度调节、旋转、当前页 JPG、全部页 PDF
- Apple Design 风格的浅色 / 深色响应式工作台
- 全程本地处理，无账号、广告、分析 SDK 和上传接口

## 开源参考

项目以 MIT 许可的
[OSS Document Scanner](https://github.com/ossappscollective/OSS-DocumentScanner)
作为本地扫描产品参考，固定参考提交为
`a89eb134cad2c5d96b9b6cb2746a58e893c505f4`。本仓库独立维护 TypeScript
透视变换、滤镜、PDF 写入和跨端 UI。完整说明见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

需要把参考项目一并拉到本机时：

```powershell
git clone https://github.com/ossappscollective/OSS-DocumentScanner.git references/OSS-DocumentScanner
git -C references/OSS-DocumentScanner checkout a89eb134cad2c5d96b9b6cb2746a58e893c505f4
```

## 本地开发

要求：Node.js 20+。Android 构建需要 JDK 17、Android SDK API 36 和 Build Tools
35；Windows 构建需要 .NET 8 SDK。

```powershell
npm ci
npm test
npm run dev
```

### Android

```powershell
npm run android:build
npm run android:install
```

`android:install` 会自动寻找 `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`，
构建 APK、安装到已授权设备并启动应用。OnePlus / ColorOS 设备需要保持解锁并
允许“通过 USB 安装”。

### Windows

```powershell
npm run windows:build
```

产物位于 `artifacts/ScanYao-win-x64.zip`。如需较大的自包含包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1 -SelfContained
```

## 目录

```text
src/                  扫描内核与 Preact 编辑器
android/              Capacitor Android 工程
windows/              WPF + WebView2 Windows 壳
scripts/              双端构建、安装脚本
public/brand/          用户提供 Logo 的跨端衍生资源
docs/                  架构与隐私说明
.github/workflows/     GitHub Pages 自动部署
```

更多细节：[架构](docs/ARCHITECTURE.md) · [隐私](docs/PRIVACY.md)

## License

[MIT](LICENSE)

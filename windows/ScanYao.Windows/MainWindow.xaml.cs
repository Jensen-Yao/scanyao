using System.Diagnostics;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace ScanYao.Windows;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var webRoot = Path.Combine(AppContext.BaseDirectory, "web");
            if (!Directory.Exists(webRoot))
            {
                MessageBox.Show("应用资源不完整，请重新下载扫耀 Windows 包。", "扫耀", MessageBoxButton.OK, MessageBoxImage.Error);
                Close();
                return;
            }

            var dataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ScanYao",
                "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataFolder);
            await Browser.EnsureCoreWebView2Async(environment);
            Browser.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.scanyao",
                webRoot,
                CoreWebView2HostResourceAccessKind.Allow);
            Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
            Browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            Browser.CoreWebView2.Settings.IsZoomControlEnabled = true;
            Browser.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                OpenBrowser(args.Uri);
            };
            Browser.CoreWebView2.DownloadStarting += (_, args) =>
            {
                var dialog = new SaveFileDialog
                {
                    FileName = Path.GetFileName(args.ResultFilePath),
                    Title = "保存扫描件",
                    Filter = "PDF 文档 (*.pdf)|*.pdf|JPG 图片 (*.jpg)|*.jpg|所有文件 (*.*)|*.*"
                };
                if (dialog.ShowDialog(this) == true)
                {
                    args.ResultFilePath = dialog.FileName;
                }
                else
                {
                    args.Cancel = true;
                }
            };
            Browser.Source = new Uri("https://app.scanyao/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var answer = MessageBox.Show(
                "扫耀需要 Microsoft Edge WebView2 Runtime。是否打开微软官方下载页？",
                "需要 WebView2",
                MessageBoxButton.YesNo,
                MessageBoxImage.Information);
            if (answer == MessageBoxResult.Yes)
            {
                OpenBrowser("https://go.microsoft.com/fwlink/p/?LinkId=2124703");
            }
            Close();
        }
        catch (Exception exception)
        {
            MessageBox.Show($"扫耀启动失败：{exception.Message}", "扫耀", MessageBoxButton.OK, MessageBoxImage.Error);
            Close();
        }
    }

    private static void OpenBrowser(string url)
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}

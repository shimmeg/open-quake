// smtc-art.exe — prints the current SMTC session's album-art thumbnail to stdout as base64
// (empty output if nothing is playing or the track has no art). [MIT]
//
// open-quake's now-playing text comes from PowerShell, but the SMTC thumbnail is a WinRT stream that
// Windows PowerShell 5.1 can't read (it returns an unprojected COM object). This tiny .NET-Framework
// helper reads it natively. Build: csc against the Windows union metadata (see package.json build:smtc).
using System;
using System.Threading.Tasks;
using Windows.Media.Control;
using Windows.Storage.Streams;

class SmtcArt {
    static int Main() {
        try {
            byte[] bytes = GetArtAsync().GetAwaiter().GetResult();
            if (bytes != null && bytes.Length > 0)
                Console.Out.Write(Convert.ToBase64String(bytes));
            return 0;
        } catch {
            return 1;   // any failure -> empty stdout, caller falls back to no art
        }
    }

    static async Task<byte[]> GetArtAsync() {
        var mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
        var session = mgr.GetCurrentSession();
        if (session == null) return null;
        var props = await session.TryGetMediaPropertiesAsync();
        var thumb = props.Thumbnail;
        if (thumb == null) return null;
        using (var stream = await thumb.OpenReadAsync()) {
            uint size = (uint)stream.Size;
            if (size == 0) return null;
            var reader = new DataReader(stream);
            await reader.LoadAsync(size);
            byte[] bytes = new byte[size];
            reader.ReadBytes(bytes);
            return bytes;
        }
    }
}

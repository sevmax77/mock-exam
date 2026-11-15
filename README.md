# Mock Exam

A personal local-first mock exam app that runs in a browser on Windows and iPhone.

## Run The App

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL shown in the terminal on Windows. To use it from an iPhone on the same Wi-Fi, open:

```text
http://YOUR_WINDOWS_IP_ADDRESS:5173
```

The app stores current session progress and completed attempt history in the browser on each device.

## Install On iPhone For Offline Use

The app is an installable PWA, but **only a production build stays offline after you close the app or restart your iPhone**.

`npm run dev` is fine for editing on Windows. It is **not** enough for a permanent iPhone offline install.

iPhone also requires **HTTPS** for offline caching. A plain `http://` address on your home network cannot finish the install, even from a production build.

### One-time iPhone install

1. On Windows, build and serve the production app:

```bash
npm install
npm run serve
```

`npm run serve` creates a local HTTPS certificate for your Windows IP address, builds the app, and starts the server.

2. In the terminal, copy the exact URL it prints, for example:

```text
https://192.168.1.23:4173
```

Use that exact `https://` URL. Do not use `http://`, port `5173`, or a different IP address.

3. On iPhone Safari, while both devices are on the same Wi-Fi, open that URL.

4. Safari will show a certificate warning because the certificate is self-signed. Continue anyway:
   - tap `Show Details` or `Advanced`
   - then continue to the site

5. Tap Safari's Share button.
6. Tap `Add to Home Screen`.
7. Open `Mock Exam` from the new Home Screen icon.
8. Wait until the app shows **Ready for offline use**, or use it for about 30 seconds on that first open.

After that, exam/practice/review and question-bank editing work offline on that iPhone even after you close the app or restart the phone. `Ask AI` still needs internet access because it calls OpenRouter.

### If Safari says it could not establish a secure connection

That usually means the certificate did not match the IP address you opened, or Windows blocked the connection.

1. Stop the server and run `npm run serve` again.
2. Copy the **exact** `https://` URL printed in the terminal.
3. Make sure iPhone and Windows are on the same Wi-Fi.
4. On Windows, allow port `4173` through the firewall when prompted, or run this once in PowerShell as Administrator:

```powershell
New-NetFirewallRule -DisplayName "Mock Exam Preview" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4173
```

5. Try opening the printed URL again in iPhone Safari.

### Which IP address should I use?

Vite may list several `Network` URLs. They are not all usable from iPhone.

| Address | Usually means |
|---------|----------------|
| `192.168.56.x` | VirtualBox or another virtual adapter. **Do not use on iPhone.** |
| `172.20.10.x` | A normal private IP, often used when the PC is connected through **iPhone hotspot/USB tether**. Use this only if the PC is actually using the iPhone as its internet connection. |
| `192.168.x.x` (other) | Often your home Wi-Fi address. This is usually the right one when iPhone and Windows are on the same home Wi-Fi. |

Private networks can use `10.x.x.x`, `172.16-31.x.x`, or `192.168.x.x`. An address does **not** need to start with `192.168` to be valid.

After `npm run serve`, look for the block titled **iPhone URL guide** in the terminal and use the `[recommended]` URL.

If you are unsure, run this on Windows:

```powershell
ipconfig
```

Find the active **Wi-Fi** adapter and use its `IPv4 Address` with `https://` and port `4173`.

If Safari still refuses the certificate completely, open the same URL once on your Windows PC browser first and confirm it loads there. Then retry on iPhone.

### If you already installed from the dev server or http://

If the app shows **Offline install not finished**, reinstall it from the HTTPS production URL above:

1. Delete the old Home Screen icon.
2. Run `npm run serve` on Windows.
3. Open `https://YOUR_WINDOWS_IP:4173` in Safari and accept the certificate warning once.
4. Add the app again from that HTTPS page.
5. Open it once from the Home Screen icon while connected so caching can finish.

Always open the app from the Home Screen icon, not from an old Safari tab.

### Updating the app or question bank

When you update the app or bundled `questions.json`, run `npm run serve` again and open the Home Screen app once while it can reach the Windows machine so Safari can download the new version.

## Add Your Questions

Replace or extend `src/data/questions.json`.

Each question uses this shape:

```json
{
  "id": "q001",
  "question": "Question text...",
  "options": [
    {
      "id": "A",
      "text": "Option A...",
      "explanation": "Why option A is or is not correct."
    },
    {
      "id": "B",
      "text": "Option B...",
      "explanation": "Why option B is or is not correct."
    }
  ],
  "correctOptionIds": ["B"],
  "summary": "Optional overall conclusion or references."
}
```

Use one ID in `correctOptionIds` for a single-answer question. Use two or more IDs for a multi-answer question. Every option should have its own explanation so review text stays attached to the option even when answers are shuffled.

## Features

- Exam mode: answer all questions, flag items, review status, then submit final answers.
- Practice mode: submit one question at a time and immediately see the correct answer and explanation.
- Questions and answer options are shuffled for every new session.
- Current session and completed attempts are saved locally in `localStorage`.
- Long questions and options are formatted for comfortable reading on mobile.

# ShiftCal

Find your own shifts in the staff schedule, from a PDF or a photo, and put them in your calendar, with reminders.

Many workplaces email one PDF, or pin up one sheet, that holds everybody's schedule. ShiftCal reads the PDF, or a photo or screenshot of the sheet, in your browser, picks out your row, shows your shifts on a dashboard, and makes a calendar file you can add to Google Calendar, Apple Calendar or Outlook.

Nothing is uploaded. The schedule, your name and your shifts stay on your device. Photos are read on the device too. There are no accounts and no server.

## What it does

- **Reads the schedule PDF** and finds the row with your name
- **Reads a photo or screenshot** of the schedule, and scanned PDFs, using text recognition that runs in the browser
- **Dashboard** with your next shift and a countdown, a four-week table, weekly hours, and a list of upcoming shifts
- **Add to calendar** in one download, with reminders (a day before, an hour before, and so on), or one tap per shift on Android
- **Spots changes** when you upload an updated schedule: new shifts, changed times and removed shifts
- **Edit by hand**: add an on-call shift, fix a time, or delete a shift
- **Settings**: your name, event title and place, reminders, unpaid breaks, how dates and times are read, highlighter colour, light or dark theme, 12 or 24-hour clock, backup and restore
- **Works offline** once it has been opened, and can be added to a phone's home screen

## Use it

1. Open the site and type your name as it appears on the schedule.
2. Choose the schedule PDF, or a photo or screenshot of the schedule. On a phone you can take the photo there and then.
3. Check the shifts it found and press **Save shifts**. For a photo, your picture is shown beside the shifts so you can compare.
4. Add the shifts to your calendar:
   - **iPhone or computer:** press **Download calendar file**, open the file, and confirm in your calendar app.
   - **Android with Google Calendar:** press **Add** beside each shift, then **Save** in Google Calendar. ShiftCal ticks off the ones you have added.

When a new schedule arrives, upload it the same way. ShiftCal shows what changed and offers a calendar file with only the new and changed shifts.

Not sure yet? Press **Try a sample schedule** to see it work with made-up names.

## Put it on GitHub Pages

The app is plain HTML, CSS and JavaScript. There is nothing to build.

1. Create a new repository on GitHub.
2. Upload everything in this folder (keep the folder structure).
3. In the repository, open **Settings**, then **Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, pick the `main` branch and the `/ (root)` folder, and save.
5. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`. Share that link with anyone.

## Run it on your computer

Browsers block parts of the app when `index.html` is opened straight from a folder, so serve it instead:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

The tests need Node.js 20 or newer and nothing else. There is nothing to install.

```
npm test
```

Lines starting with `Warning: Cannot load "@napi-rs/canvas"` are normal. They come from pdf.js, which only needs that package to draw pages, and the tests only read text.

There are 128 tests:

| File | What it checks |
| --- | --- |
| `tests/parser.test.js` | Reading times, dates and names, plus error cases |
| `tests/layouts.test.js` | Harder table layouts: split text, tight columns, repeated headers, totals rows |
| `tests/pdf.test.js` | Real PDF files in, shifts out, for 11 made-up schedules |
| `tests/ics.test.js` | The calendar file: structure, reminders, overnight shifts, escaping |
| `tests/shifts.test.js` | Comparing schedules, hours, breaks, next shift |
| `tests/storage.test.js` | Saving and loading, including damaged data |
| `tests/platform.test.js` | Telling Android, iPhone and computers apart |
| `tests/ocr.test.js` | Photos: cleaning recognised words, building rows, and shifts from 9 recorded recognition runs |
| `tests/image-prep.test.js` | Photo clean-up: finding ink, removing table lines, straightening a tilted picture |

The PDFs in `tests/fixtures` use invented names. To rebuild them:

```
pip install reportlab
python3 tools/make_fixtures.py
```

## Schedule layouts it can read

- **Grid**: days across the top, one row per person. Day names only, dates in the header, a second header line with dates, extra columns such as Position or Hours, two-line cells, and more than one week are all handled.
- **Names across the top**: one row per day.
- **List by day**: a date heading followed by `Name  9:00 AM - 5:00 PM` lines.
- **List by person**: a name heading followed by `Mon Nov 16  9:00 AM - 5:00 PM` lines.
- **One line per shift**: `Name  11/16/2026  9:00 AM  5:00 PM`.

Times can be written as `9:00 AM - 5:00 PM`, `9a-5p`, `09:00-17:30`, `0900-1730` or `9-5`. Overnight shifts (`10pm-6am`) and split shifts (`9-1 / 2-6`) work. `OFF`, `VAC`, `RDO` and blanks count as days off.

If the schedule has day names but no dates, ShiftCal asks which week it is for. If two people match your name, it asks which one is you.

## Photos

A photo is cleaned up before it is read: it is straightened, the lighting is evened out, and the table's ruled lines are painted over so they are not mistaken for letters. The text is then recognised by Tesseract, and the same shift finder used for PDFs takes over, with extra safeguards so that a badly read table gives no result instead of a wrong one.

What to expect, from 45 made-up test pictures (9 schedules, each as a clean screenshot, a careful photo, a tilted photo, a small chat-app image, and a poor photo):

| Kind of picture | Read correctly |
| --- | --- |
| Clean screenshot | 9 of 9 |
| Careful photo, straight on | 9 of 9 |
| Tilted photo (3.5 degrees) | 9 of 9 |
| Small image (1280 px wide) | 9 of 9 |
| Poor photo (blurred, skewed, dim, heavily compressed) | 5 of 9 |

These are simulated photos, not ones taken with a real phone, so treat the numbers as a guide. With a poor photo the usual failure is a missing shift, and sometimes a shift on the wrong day or with a wrong time. That is why the review screen shows the photo and asks you to check.

For the best result: hold the phone straight above the page, in good light, with the whole table sharp and filling the picture. A screenshot reads better than a photo of a screen. The PDF, when you have it, is always best.

The first photo downloads the reader, about 7 MB. After that it works offline. Reading takes a few seconds on a computer and longer on a phone. Only English text is recognised.

## Limits

- **A photo is never as reliable as the PDF.** Reading a picture means recognising every letter, and a 3 can come out as an 8. ShiftCal shows your photo next to the shifts it found: check each one before saving. See "Photos" below for what to expect.
- **Unusual layouts may not be recognised.** The app tells you when it cannot find your shifts, and you can add them by hand. Settings has a "show the text" option that helps when reporting a problem.
- **Times with no am or pm are worked out**, and marked "Check time" for you to confirm. The rule is in Settings under "Earliest a shift starts".
- **A calendar file can add and update shifts but cannot delete one.** When a shift is removed from the schedule, ShiftCal tells you so you can delete it from your calendar yourself.
- **Google Calendar on Android adds only the first shift from a calendar file.** That is why Android gets one Add button per shift. To add them all at once, import the file at calendar.google.com (Settings, then Import & export) with "Desktop site" turned on.
- **Reminders depend on the calendar app.** Some apps, Google Calendar among them, may use their own default reminder instead of the ones in the file.
- **Shifts are saved in one browser.** Use Download backup and Restore backup in Settings to move them to another browser or phone.
- Needs a browser from 2023 or later.
- The repository is about 17 MB, most of it the text-recognition engine in `vendor/tesseract/`.

## How it works

```
index.html            the page
css/styles.css        the look
js/app.js             the screen: dashboard, upload, export, settings
js/parser.js          turns the PDF text into one person's shifts
js/pdf-reader.js      opens the PDF with pdf.js; hands scanned PDFs to the photo reader
js/photo-reader.js    reads a photo with Tesseract text recognition
js/image-prep.js      cleans a photo up first: straightens it, evens the light, removes table lines
js/ocr-items.js       turns recognised words into rows the shift finder can use
js/pdf-items.js       converts pdf.js text into simple positioned items
js/shifts.js          compares schedules, totals hours, finds the next shift
js/ics.js             writes the calendar (.ics) file
js/storage.js         saves to the browser's local storage
js/platform.js        tells Android, iPhone and computers apart
sw.js                 offline support
vendor/pdfjs/         pdf.js, the PDF reader (Mozilla)
vendor/tesseract/     Tesseract.js, the text-recognition engine, with its English data
fonts/                Bricolage Grotesque
sample/               the sample schedule
tests/                the test suite
tools/                script that builds the test PDFs
```

The parser works on text positions. It groups text into lines and cells, finds the header row that lists the days, works out the date of each column, finds the row whose name matches yours, and reads the time in each day's column. If there is no grid it tries the list layouts instead.

Safety: text from the PDF or photo is only ever added to the page as plain text, the page has a strict Content Security Policy, and pdf.js runs with script evaluation turned off.

## Ideas for version 2

- Sign in with Google to add, update and delete calendar events automatically
- Reminders by push notification

## Credits

- [pdf.js](https://mozilla.github.io/pdf.js/) by Mozilla, Apache License 2.0 (`vendor/pdfjs/LICENSE`)
- [Tesseract.js](https://github.com/naptha/tesseract.js) and the Tesseract engine and English data it uses, Apache License 2.0 (`vendor/tesseract/`)
- [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) by Mathieu Triay, SIL Open Font License 1.1 (`fonts/LICENSE-bricolage-grotesque.txt`)

## Licence

MIT. See `LICENSE`.

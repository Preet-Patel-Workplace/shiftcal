"""Builds the made-up schedule PDFs used by the tests and the sample button.

Every name in these files is invented. Run from the project folder:

    python3 tools/make_fixtures.py

Needs: pip install reportlab
"""
import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "tests", "fixtures")
SAMPLE = os.path.join(ROOT, "sample")
os.makedirs(FIX, exist_ok=True)
os.makedirs(SAMPLE, exist_ok=True)

styles = getSampleStyleSheet()
GRID = TableStyle([
    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6e9f0")),
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 9),
    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
])


def build(path, flow):
    doc = SimpleDocTemplate(path, pagesize=landscape(letter), leftMargin=30, rightMargin=30, topMargin=30, bottomMargin=30)
    doc.build(flow)


def table(data, style=GRID, widths=None):
    t = Table(data, colWidths=widths)
    t.setStyle(style)
    return t


# 1. Day names only, week given in the title, am/pm times.
build(os.path.join(FIX, "grid_basic.pdf"), [
    Paragraph("Northgate Branch Staff Schedule", styles["Title"]),
    Paragraph("Week of November 15, 2026", styles["Heading2"]),
    Spacer(1, 8),
    table([
        ["Employee", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        ["Avery Collins", "OFF", "9:00 AM - 5:00 PM", "9:00 AM - 5:00 PM", "OFF", "12:00 PM - 8:00 PM", "9:00 AM - 5:00 PM", "OFF"],
        ["Jordan Mehta", "10:00 AM - 4:00 PM", "OFF", "12:00 PM - 8:00 PM", "12:00 PM - 8:00 PM", "OFF", "OFF", "9:00 AM - 3:00 PM"],
        ["Sam Okafor", "OFF", "8:30 AM - 4:30 PM", "OFF", "8:30 AM - 4:30 PM", "8:30 AM - 4:30 PM", "1:00 PM - 9:00 PM", "OFF"],
        ["Riley Tremblay", "OFF", "OFF", "9:00 AM - 1:00 PM", "9:00 AM - 1:00 PM", "9:00 AM - 1:00 PM", "OFF", "10:00 AM - 6:00 PM"],
    ]),
])

# 2. Dates in the header, times with no am/pm.
build(os.path.join(FIX, "grid_dates_no_ampm.pdf"), [
    Paragraph("Weekly Rota", styles["Title"]),
    table([
        ["Name", "Mon Nov 16", "Tue Nov 17", "Wed Nov 18", "Thu Nov 19", "Fri Nov 20", "Sat Nov 21", "Sun Nov 22"],
        ["Avery Collins", "9-5", "OFF", "12-8", "10:30-6:30", "OFF", "7-3", "OFF"],
        ["Jordan Mehta", "OFF", "1-9", "1-9", "OFF", "9-5:30", "OFF", "11-7"],
        ["Sam Okafor", "8-4", "8-4", "OFF", "OFF", "5-10", "2-10", "OFF"],
    ]),
])

# 3. Two header lines (day names, then numeric dates), 24-hour times,
#    plus Position and Hours columns that must be ignored.
build(os.path.join(FIX, "grid_two_line_header_24h.pdf"), [
    Paragraph("Schedule 2026", styles["Title"]),
    table([
        ["Employee", "Position", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Hours"],
        ["", "", "11/16", "11/17", "11/18", "11/19", "11/20", "11/21", "11/22", ""],
        ["Collins, Avery", "CSR", "09:00-17:30", "09:00-17:30", "OFF", "13:00-21:00", "OFF", "OFF", "10:00-16:00", "30.5"],
        ["Mehta, Jordan", "Teller", "OFF", "13:00-21:00", "13:00-21:00", "OFF", "09:00-17:30", "09:00-15:00", "OFF", "30.5"],
        ["Collins, Dana", "CSR", "13:00-21:00", "OFF", "09:00-17:30", "09:00-17:30", "OFF", "OFF", "OFF", "24.5"],
    ]),
])

# 4. Two weeks on two pages, cells with a second line for the role, and a
#    split shift and an overnight shift.
week1 = [
    ["Staff", "Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20", "Sat 21", "Sun 22"],
    ["Avery Collins", "9:00am-5:00pm\nFront desk", "OFF", "9:00am-1:00pm\n2:00pm-6:00pm", "OFF", "10:00pm-6:00am\nNight audit", "OFF", "OFF"],
    ["Sam Okafor", "OFF", "9:00am-5:00pm\nFront desk", "OFF", "9:00am-5:00pm\nFront desk", "OFF", "12:00pm-8:00pm\nFloor", "OFF"],
]
week2 = [
    ["Staff", "Mon 23", "Tue 24", "Wed 25", "Thu 26", "Fri 27", "Sat 28", "Sun 29"],
    ["Avery Collins", "OFF", "12:00pm-8:00pm\nFloor", "12:00pm-8:00pm\nFloor", "OFF", "OFF", "9:00am-5:00pm\nFront desk", "OFF"],
    ["Sam Okafor", "9:00am-5:00pm\nFront desk", "OFF", "OFF", "9:00am-5:00pm\nFront desk", "9:00am-5:00pm\nFront desk", "OFF", "OFF"],
]
build(os.path.join(FIX, "grid_two_weeks_multiline.pdf"), [
    Paragraph("Schedule: November 16 - November 22, 2026", styles["Heading2"]),
    table(week1),
    PageBreak(),
    Paragraph("Schedule: November 23 - November 29, 2026", styles["Heading2"]),
    table(week2),
])

# 5. A time that wraps onto two lines inside a narrow cell.
build(os.path.join(FIX, "grid_wrapped_time.pdf"), [
    Paragraph("Week of 11/15/2026", styles["Heading2"]),
    table([
        ["Name", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        ["Avery Collins", "OFF", "9:00 AM -\n5:00 PM", "9:00 AM -\n5:00 PM", "OFF", "OFF", "1:00 PM -\n9:00 PM", "OFF"],
        ["Jordan Mehta", "9:00 AM -\n3:00 PM", "OFF", "OFF", "9:00 AM -\n5:00 PM", "9:00 AM -\n5:00 PM", "OFF", "OFF"],
    ], widths=[110, 70, 70, 70, 70, 70, 70, 70]),
])

# 6. Day names only and no date anywhere: the app has to ask for the week.
build(os.path.join(FIX, "grid_no_dates.pdf"), [
    Paragraph("Staff Schedule", styles["Title"]),
    table([
        ["Employee", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        ["Avery Collins", "9:00 AM - 5:00 PM", "OFF", "9:00 AM - 5:00 PM", "OFF", "OFF", "11:00 AM - 7:00 PM", "OFF"],
        ["Jordan Mehta", "OFF", "9:00 AM - 5:00 PM", "OFF", "9:00 AM - 5:00 PM", "9:00 AM - 5:00 PM", "OFF", "OFF"],
    ]),
])


def text_pdf(path, rows, size=11, pagesize=letter):
    """rows: list of lists of (x, text); one list per line."""
    c = canvas.Canvas(path, pagesize=pagesize)
    y = pagesize[1] - 60
    c.setFont("Helvetica", size)
    for row in rows:
        if row == "PAGE":
            c.showPage()
            c.setFont("Helvetica", size)
            y = pagesize[1] - 60
            continue
        for x, text in row:
            c.drawString(x, y, text)
        y -= size * 1.6
    c.save()


# 7. List grouped by day.
text_pdf(os.path.join(FIX, "list_by_day.pdf"), [
    [(60, "Daily Staffing")],
    [],
    [(60, "Monday, November 16, 2026")],
    [(60, "Avery Collins"), (220, "9:00 AM - 5:00 PM"), (380, "Teller")],
    [(60, "Jordan Mehta"), (220, "12:00 PM - 8:00 PM"), (380, "Floor")],
    [],
    [(60, "Tuesday, November 17, 2026")],
    [(60, "Jordan Mehta"), (220, "9:00 AM - 5:00 PM"), (380, "Teller")],
    [(60, "Sam Okafor"), (220, "9:00 AM - 5:00 PM"), (380, "Floor")],
    [],
    [(60, "Wednesday, November 18, 2026")],
    [(60, "Avery Collins"), (220, "1:00 PM - 9:00 PM"), (380, "Floor")],
    [(60, "Sam Okafor"), (220, "9:00 AM - 5:00 PM"), (380, "Teller")],
])

# 8. List grouped by person.
text_pdf(os.path.join(FIX, "list_by_person.pdf"), [
    [(60, "Schedule by employee")],
    [],
    [(60, "Jordan Mehta")],
    [(80, "Mon Nov 16"), (200, "12:00 PM - 8:00 PM")],
    [(80, "Tue Nov 17"), (200, "9:00 AM - 5:00 PM")],
    [],
    [(60, "Avery Collins")],
    [(80, "Mon Nov 16"), (200, "9:00 AM - 5:00 PM")],
    [(80, "Wed Nov 18"), (200, "1:00 PM - 9:00 PM")],
    [(80, "Sat Nov 21"), (200, "10:00 AM - 4:00 PM")],
    [],
    [(60, "Sam Okafor")],
    [(80, "Tue Nov 17"), (200, "9:00 AM - 5:00 PM")],
])

# 9. One line per shift, with separate start and end columns.
text_pdf(os.path.join(FIX, "rows_per_shift.pdf"), [
    [(60, "Employee"), (220, "Date"), (320, "Start"), (400, "End"), (480, "Role")],
    [(60, "Avery Collins"), (220, "11/16/2026"), (320, "9:00 AM"), (400, "5:00 PM"), (480, "Teller")],
    [(60, "Jordan Mehta"), (220, "11/16/2026"), (320, "12:00 PM"), (400, "8:00 PM"), (480, "Floor")],
    [(60, "Avery Collins"), (220, "11/18/2026"), (320, "1:00 PM"), (400, "9:00 PM"), (480, "Floor")],
    [(60, "Sam Okafor"), (220, "11/18/2026"), (320, "9:00 AM"), (400, "5:00 PM"), (480, "Teller")],
    [(60, "Avery Collins"), (220, "11/21/2026"), (320, "10:00 AM"), (400, "4:00 PM"), (480, "Teller")],
])

# 10. Names across the top, one row per day.
build(os.path.join(FIX, "names_across_top.pdf"), [
    Paragraph("Team Rota", styles["Title"]),
    table([
        ["", "Avery Collins", "Jordan Mehta", "Sam Okafor"],
        ["Mon Nov 16", "9:00 AM - 5:00 PM", "OFF", "12:00 PM - 8:00 PM"],
        ["Tue Nov 17", "OFF", "9:00 AM - 5:00 PM", "9:00 AM - 5:00 PM"],
        ["Wed Nov 18", "1:00 PM - 9:00 PM", "9:00 AM - 5:00 PM", "OFF"],
        ["Thu Nov 19", "OFF", "OFF", "9:00 AM - 5:00 PM"],
        ["Fri Nov 20", "9:00 AM - 3:00 PM", "12:00 PM - 8:00 PM", "OFF"],
    ]),
])

# 11. A scanned schedule has no text at all, only a picture.
c = canvas.Canvas(os.path.join(FIX, "scanned_no_text.pdf"), pagesize=letter)
c.rect(60, 500, 480, 200)
c.line(60, 600, 540, 600)
c.save()

# Sample for the "Try a sample schedule" button. Day names only, so the app
# can place it in the current week whenever it is opened.
build(os.path.join(SAMPLE, "sample-schedule.pdf"), [
    Paragraph("Maple Street Branch", styles["Title"]),
    Paragraph("Staff schedule (sample with made-up names)", styles["Heading3"]),
    Spacer(1, 8),
    table([
        ["Employee", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        ["Alex Sample", "OFF", "9:00 AM - 5:00 PM", "9:00 AM - 5:00 PM", "OFF", "12:00 PM - 8:00 PM", "9:00 AM - 5:00 PM", "10:00 AM - 4:00 PM"],
        ["Jordan Mehta", "10:00 AM - 4:00 PM", "OFF", "12:00 PM - 8:00 PM", "12:00 PM - 8:00 PM", "OFF", "OFF", "9:00 AM - 3:00 PM"],
        ["Sam Okafor", "OFF", "8:30 AM - 4:30 PM", "OFF", "8:30 AM - 4:30 PM", "8:30 AM - 4:30 PM", "1:00 PM - 9:00 PM", "OFF"],
        ["Riley Tremblay", "OFF", "OFF", "9:00 AM - 1:00 PM", "9:00 AM - 1:00 PM", "9:00 AM - 1:00 PM", "OFF", "10:00 AM - 6:00 PM"],
        ["Dana Whitefish", "11:00 AM - 5:00 PM", "9:00 AM - 5:00 PM", "OFF", "OFF", "9:00 AM - 5:00 PM", "12:00 PM - 8:00 PM", "OFF"],
    ]),
])

print("Fixtures written to", FIX)
print("Sample written to", SAMPLE)

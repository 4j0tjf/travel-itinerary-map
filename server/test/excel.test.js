import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseExcel } from "../services/excel.js";

test("finds English header aliases after title rows, parses native Excel dates and numeric time", async () => {
  const book = new ExcelJS.Workbook();
  const intro = book.addWorksheet("안내");
  intro.addRow(["업로드 안내"]);
  const sheet = book.addWorksheet("Schedule");
  sheet.addRow(["My travel plan"]);
  sheet.addRow([
    "Date",
    "Time",
    "Place",
    "Address",
    "Latitude",
    "Longitude",
    "ImageURL",
  ]);
  sheet.addRow([
    new Date("2026-12-01T00:00:00Z"),
    0.375,
    "아침 산책",
    "Shizuoka",
    35,
    138,
    "javascript:alert(1)",
  ]);
  const result = await parseExcel(await book.xlsx.writeBuffer(), {
    filename: "시즈오카.xlsx",
  });
  assert.equal(result.sheetName, "Schedule");
  assert.equal(result.itinerary.title, "시즈오카");
  const place = result.itinerary.days[0].places[0];
  assert.equal(place.time, "09:00");
  assert.equal(place.image, "");
  assert.equal(result.itinerary.days[0].date, "2026-12-01");
});
test("accepts zero coordinates and rejects incomplete coordinate pairs", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("일정");
  sheet.addRow(["날짜", "시간", "장소명", "위도", "경도"]);
  sheet.addRow(["2026-12-01", "09:00", "원점", 0, 0]);
  let result = await parseExcel(await book.xlsx.writeBuffer());
  assert.equal(result.itinerary.days[0].places[0].lat, 0);
  assert.equal(result.warnings.length, 0);
  sheet.getRow(2).getCell(5).value = "";
  await assert.rejects(
    async () => parseExcel(await book.xlsx.writeBuffer()),
    (error) =>
      error.status === 400 &&
      error.details.some((d) => d.includes("위도·경도")),
  );
});
test("requires real rows and enforces row limits", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("일정");
  sheet.addRow(["날짜", "시간", "장소명", "주소"]);
  await assert.rejects(
    async () => parseExcel(await book.xlsx.writeBuffer()),
    /등록할 일정 행/,
  );
  for (let i = 0; i < 1001; i++)
    sheet.addRow(["2026-12-01", "09:00", "장소", "주소"]);
  await assert.rejects(
    async () => parseExcel(await book.xlsx.writeBuffer()),
    /1,000행/,
  );
});

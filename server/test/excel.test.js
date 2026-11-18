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

test("native Google Maps hyperlinks preserve place text, both times and AI/buffer notes on import", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("여행 일정");
  sheet.addRow(["날짜", "시간", "종료시간", "장소명", "주소", "위도", "경도", "메모", "이동수단", "이미지URL", "여행지역", "여행명"]);
  const mapsUrl = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("시즈오카역 Shizuoka Station, Shizuoka");
  sheet.addRow(["2026-12-01", "11:10", "12:00", { text: "시즈오카역", hyperlink: mapsUrl },
    { text: "Shizuoka Station, Shizuoka", hyperlink: mapsUrl }, null, null,
    "[AI 추천] 앞 여유 10분 / 체류 50분 / 뒤 여유 10분 / 다음 이동 20분(계획용 추정)", "WALK", "", "시즈오카", "시간표 여행"]);
  const result = await parseExcel(await book.xlsx.writeBuffer());
  const place = result.itinerary.days[0].places[0];
  assert.equal(place.name, "시즈오카역");
  assert.equal(place.address, "Shizuoka Station, Shizuoka");
  assert.equal(place.time, "11:10");
  assert.equal(place.endTime, "12:00");
  assert.match(place.memo, /^\[AI 추천\]/);
  assert.match(place.memo, /앞 여유 10분/);
});

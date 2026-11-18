import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ExcelJS from "exceljs";
import { HttpError } from "../utils/errors.js";

export function workbookFilename(input = "여행 일정.xlsx") {
  const name = String(input).replace(/[\\/\x00-\x1f\x7f]/g, "").trim().slice(0, 160) || "여행 일정.xlsx";
  return /\.xlsx$/i.test(name) ? name : name + ".xlsx";
}

export function createWorkbookStorage(dataDir) {
  const directory = path.join(dataDir, "workbooks");
  function location(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "")) throw new Error("Invalid workbook reference");
    return path.join(directory, id + ".xlsx");
  }
  return {
    async put(buffer, filename) {
      if (!buffer?.length || buffer.length > 5 * 1024 * 1024) throw new HttpError(400, "Excel 파일은 5MB 이하여야 합니다.");
      await mkdir(directory, { recursive: true });
      const id = randomUUID();
      try { await writeFile(location(id), buffer, { flag: "wx", mode: 0o600 }); }
      catch (error) { await rm(location(id), { force: true }).catch(() => {}); throw error; }
      return { id, filename: workbookFilename(filename), bytes: buffer.length };
    },
    read(reference) { return readFile(location(reference.id)); },
    async remove(reference) {
      if (reference) await rm(location(reference.id), { force: true }).catch(() => {});
    },
  };
}

// Older journeys have no stored source file. Export only their current itinerary.
export async function exportCurrentItinerary(trip) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("여행 일정");
  sheet.addRow(["날짜", "시간", "종료시간", "장소명", "주소", "위도", "경도", "메모", "이동수단", "이미지URL", "여행지역", "여행명"]);
  for (const day of trip.days) for (const place of day.places) {
    sheet.addRow([day.date, place.time, place.endTime || "", place.name, place.address,
      place.lat, place.lng, place.memo, place.mode, place.image, trip.region, trip.title]);
  }
  sheet.columns.forEach((column, index) => {
    column.width = [14, 10, 10, 28, 40, 14, 14, 42, 14, 28, 18, 24][index];
    column.hidden = [5, 6, 9, 10, 11].includes(index);
  });
  sheet.eachRow((row, index) => {
    row.height = index === 1 ? 36 : 60;
    row.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: "맑은 고딕", size: index === 1 ? 13 : 12, bold: index === 1, color: { argb: index === 1 ? "FFFFFFFF" : "FF2E3832" } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 1 ? "FF285748" : index % 2 ? "FFF3F6EE" : "FFFFFFFF" } };
    });
  });
  sheet.views = [{ state: "frozen", xSplit: 4, ySplit: 1, showGridLines: false }];
  sheet.autoFilter = `A1:L${sheet.rowCount}`;
  sheet.pageSetup.orientation = "landscape";
  sheet.pageSetup.printTitlesRow = "1:1";
  return Buffer.from(await book.xlsx.writeBuffer());
}

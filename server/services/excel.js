import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { HttpError } from "../utils/errors.js";

const aliases = {
  date: ["날짜", "일자", "방문일", "여행날짜", "date"],
  time: ["시간", "방문시간", "시작시간", "time", "starttime"],
  endTime: ["종료시간", "endtime"],
  name: ["장소명", "장소", "방문장소", "방문지", "name", "place", "placename"],
  address: ["주소", "상세주소", "address"],
  lat: ["위도", "lat", "latitude"],
  lng: ["경도", "lng", "lon", "longitude"],
  memo: ["메모", "비고", "설명", "memo", "notes", "note"],
  mode: ["이동수단", "교통수단", "mode", "transport", "travelmode"],
  image: ["이미지url", "사진url", "이미지", "imageurl", "image"],
  category: ["분류", "유형", "카테고리", "category"],
  region: ["여행지역", "지역", "도시", "region", "city"],
  title: ["여행명", "여행이름", "일정이름", "tripname", "triptitle"],
};
const normalize = (value) =>
  String(value)
    .replace(/[\s_()]/g, "")
    .toLowerCase();
function value(cell) {
  const raw = cell.value;
  if (raw == null) return "";
  if (raw instanceof Date || typeof raw === "number" || typeof raw === "string")
    return raw;
  if (raw.richText) return raw.richText.map((part) => part.text).join("");
  if (raw.formula || raw.sharedFormula) return raw.result ?? "";
  if (raw.hyperlink) return raw.text || raw.hyperlink;
  return "";
}
function text(raw) {
  return String(raw ?? "").trim();
}
function date(raw, date1904) {
  if (typeof raw === "number") {
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    raw = new Date(epoch + Math.floor(raw) * 86400000);
  }
  if (raw instanceof Date)
    return Number.isNaN(raw.valueOf()) ? "" : raw.toISOString().slice(0, 10);
  const match = text(raw).match(
    /^(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일|\s|$)/,
  );
  if (!match) return "";
  const result = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(result + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === result
    ? result
    : "";
}
function time(raw) {
  if (raw instanceof Date) return raw.toISOString().slice(11, 16);
  if (typeof raw === "number" && raw >= 0 && raw < 1) {
    const minutes = Math.round(raw * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = text(raw).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return match && +match[1] < 24 && +match[2] < 60
    ? `${match[1].padStart(2, "0")}:${match[2]}`
    : "";
}
function coordinate(raw, limit) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : NaN;
}
function imageUrl(raw) {
  const url = text(raw);
  if (!url) return "";
  try {
    return /^https?:$/.test(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

export async function parseExcel(
  buffer,
  { filename = "여행", title = "", sheetName = "" } = {},
) {
  if (!buffer?.length || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    throw new HttpError(400, "올바른 .xlsx 파일을 선택해 주세요.");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new HttpError(
      400,
      "Excel 파일을 읽지 못했습니다. 암호가 없는 .xlsx 파일인지 확인해 주세요.",
    );
  }
  if (workbook.worksheets.length > 30)
    throw new HttpError(400, "워크시트는 30개 이하인 파일을 사용해 주세요.");
  let sheet, headerRow, mapping;
  for (const candidate of workbook.worksheets) {
    if (sheetName && candidate.name !== sheetName) continue;
    for (
      let rowIndex = 1;
      rowIndex <= Math.min(candidate.rowCount, 20);
      rowIndex++
    ) {
      const found = {};
      candidate.getRow(rowIndex).eachCell((cell, index) => {
        const name = normalize(value(cell));
        for (const [field, names] of Object.entries(aliases))
          if (names.includes(name)) found[field] = index;
      });
      if (found.date && found.time && found.name) {
        sheet = candidate;
        headerRow = rowIndex;
        mapping = found;
        break;
      }
    }
    if (sheet) break;
  }
  if (!sheet)
    throw new HttpError(
      400,
      "날짜·시간·장소명 컬럼을 찾지 못했습니다. 가이드의 기본 양식으로 작성해 주세요.",
    );
  if (sheet.rowCount - headerRow > 1000 || sheet.columnCount > 100)
    throw new HttpError(
      400,
      "일정은 최대 1,000행·100열까지 업로드할 수 있습니다.",
    );
  const errors = [],
    warnings = [],
    rows = [];
  let region = "",
    embeddedTitle = "";
  for (let i = headerRow + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (!row.hasValues) continue;
    const fields = Object.fromEntries(
      Object.entries(mapping).map(([key, col]) => [
        key,
        value(row.getCell(col)),
      ]),
    );
    if (!Object.values(fields).some((v) => text(v))) continue;
    const parsedDate = date(fields.date, workbook.properties.date1904);
    const parts = text(fields.time).split(/\s*[-~～–—]\s*/);
    const start = time(
      fields.time instanceof Date || typeof fields.time === "number"
        ? fields.time
        : parts[0],
    );
    const end = time(fields.endTime || parts[1] || "");
    const name = text(fields.name).slice(0, 200);
    const lat = coordinate(fields.lat, 90),
      lng = coordinate(fields.lng, 180);
    const hasCoordinates = lat !== null && lng !== null;
    if (!parsedDate)
      errors.push(`${i}행: 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.`);
    if (!start) errors.push(`${i}행: 시간을 HH:MM 형식으로 입력해 주세요.`);
    if (!name) errors.push(`${i}행: 장소명이 필요합니다.`);
    if (
      Number.isNaN(lat) ||
      Number.isNaN(lng) ||
      (lat === null) !== (lng === null)
    )
      errors.push(
        `${i}행: 위도·경도를 함께 올바른 범위로 입력하거나 둘 다 비워 주세요.`,
      );
    if (!hasCoordinates && !text(fields.address))
      errors.push(`${i}행: 주소 또는 위도·경도가 필요합니다.`);
    if (fields.endTime && !end)
      errors.push(`${i}행: 종료시간을 HH:MM 형식으로 입력해 주세요.`);
    if (end && start && end < start)
      errors.push(`${i}행: 종료시간은 시작시간 이후여야 합니다.`);
    if (!hasCoordinates)
      warnings.push(
        `${i}행 ${name}: 좌표가 없어 지도 마커에서 제외됩니다. 주소로 Google Maps에서 열 수 있습니다.`,
      );
    const modeRaw = text(fields.mode).toUpperCase();
    const mode =
      ["DRIVE", "자동차", "차량", "렌터카", "택시", "CAR", "TAXI"].includes(modeRaw) || !modeRaw
        ? "DRIVE"
        : ["WALK", "도보", "WALKING"].includes(modeRaw)
          ? "WALK"
          : ["TRANSIT", "대중교통", "버스", "지하철", "전철", "기차", "열차", "BUS", "SUBWAY", "TRAIN", "RAIL"].includes(modeRaw)
            ? "TRANSIT"
            : "OTHER";
    if (mode === "OTHER")
      warnings.push(
        `${i}행 ${name}: 자동차·도보·대중교통 이외의 이동수단은 경로 계산을 지원하지 않습니다.`,
      );
    rows.push({
      date: parsedDate,
      place: {
        id: randomUUID(),
        time: start,
        endTime: end,
        name,
        nameJa: "",
        category: text(fields.category).slice(0, 60) || "방문 장소",
        address: text(fields.address).slice(0, 1000),
        lat,
        lng,
        memo: text(fields.memo).slice(0, 5000),
        image: imageUrl(fields.image),
        mode,
      },
    });
    region ||= text(fields.region).slice(0, 80);
    embeddedTitle ||= text(fields.title).slice(0, 80);
  }
  if (errors.length)
    throw new HttpError(
      400,
      "일정의 입력 내용을 확인해 주세요. 저장되지 않았습니다.",
      errors.slice(0, 50),
    );
  if (!rows.length) throw new HttpError(400, "등록할 일정 행이 없습니다.");
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const fallbackTitle =
    filename
      .replace(/\.xlsx$/i, "")
      .replace(/[<>]/g, "")
      .slice(0, 80) || "새 여행";
  return {
    itinerary: {
      id: randomUUID(),
      title: text(title).slice(0, 80) || embeddedTitle || fallbackTitle,
      subtitle: `${dates.length}일간의 여행`,
      country: "",
      region:
        region || embeddedTitle || text(title).slice(0, 80) || fallbackTitle,
      days: dates.map((day, i) => ({
        date: day,
        title: `${i + 1}일차 여행`,
        description: `${rows.filter((row) => row.date === day).length}개의 장소를 둘러보는 하루`,
        places: rows
          .filter((row) => row.date === day)
          .map((row) => row.place)
          .sort((a, b) => a.time.localeCompare(b.time)),
      })),
    },
    warnings: warnings.slice(0, 100),
    sheetName: sheet.name,
  };
}

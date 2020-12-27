import { parse } from "https://deno.land/std@0.74.0/encoding/csv.ts";
import * as log from "https://deno.land/std/log/mod.ts";

const SHEET_ID = Deno.env.get("SHEET_ID");
const OUTPUT = "rrt.json";

type ContactType = {
  name: string;
  contact: string;
};

type WardType = {
  wardNo: number;
  medicalOfficer: ContactType;
  ashaWorker: ContactType;
  lsgdWardMember: ContactType;
  kudumbaShree: ContactType;
  anganawadiTeacher: ContactType;
};

enum LsgdVariant {
  Grama = "Grama",
  Block = "Block",
  Muncipality = "Muncipality",
  Corporation = "Corporation",
}

type LsgdType = {
  district: string;
  lsg: string;
  wards: WardType[];
  type: LsgdVariant;
};

await log.setup({
  handlers: {
    stringFmt: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: "[{datetime}] [{levelName}] {msg}",
    }),
  },

  loggers: {
    default: {
      level: "DEBUG",
      handlers: ["stringFmt", "functionFmt"],
    },
    dataLogger: {
      level: "INFO",
      handlers: ["anotherFmt"],
    },
  },
});

type csvType = {
  "S.No": string;
  districtName: string;
  lsg: string;
  wardNo: string;
  medicalOfficerName: string;
  medicalOfficerContact: string;
  ashaWorkerName: string;
  ashaWorkerContact: string;
  lsgdWardMemberName: string;
  lsgdWardMemberContact: string;
  kudumbaShreeName: string;
  kudumbaShreeContact: string;
  anganawadiTeacherName: string;
  anganawadiTeacherContact: string;
};

const generateLsg = (row: csvType): LsgdType => ({
  district: row.districtName.replace(" District", "").trim(),
  lsg: row.lsg
    .replace(`, ${row.districtName}`, "")
    .replace(" Grama Panchayat", "")
    .replace(" Block Panchayat", "")
    .replace(" Muncipality", "")
    .replace(" Corporation", "")
    .trim(),
  wards: [],
  type: row.lsg.includes("Grama")
    ? LsgdVariant.Grama
    : row.lsg.includes("Block")
    ? LsgdVariant.Block
    : row.lsg.includes("Muncipality")
    ? LsgdVariant.Muncipality
    : LsgdVariant.Corporation,
});

try {
  if (SHEET_ID === undefined) {
    log.critical("no SHEET_ID found in env");
    Deno.exit(1);
  }
  const data: LsgdType[] = [];
  const url = encodeURI(
    "https://docs.google.com/spreadsheets/d/e/" +
      SHEET_ID +
      "/pub?gid=0&single=true&output=csv"
  );
  log.info(`fetching csv file from ${url}`);
  const res = await fetch(url);
  const csv = (
    await parse(await res.text(), {
      skipFirstRow: true,
      columns: [
        "S.No",
        "districtName",
        "lsg",
        "wardNo",
        "medicalOfficerName",
        "medicalOfficerContact",
        "ashaWorkerName",
        "ashaWorkerContact",
        "lsgdWardMemberName",
        "lsgdWardMemberContact",
        "kudumbaShreeName",
        "kudumbaShreeContact",
        "anganawadiTeacherName",
        "anganawadiTeacherContact",
      ],
    })
  ).slice(1) as csvType[];
  log.info(`parsed csv file successfully`);
  let current: LsgdType = generateLsg(csv[0]);
  for (const row of csv) {
    if (row.lsg !== current.lsg && row.lsg !== "") {
      data.push(current);
      current = generateLsg(row);
    }
    const parsedWard = parseInt(row.wardNo);
    if (!isNaN(parsedWard)) {
      current.wards.push({
        wardNo: parsedWard,
        anganawadiTeacher: {
          name: row.anganawadiTeacherName,
          contact: row.anganawadiTeacherContact,
        },
        kudumbaShree: {
          name: row.kudumbaShreeName,
          contact: row.kudumbaShreeContact,
        },
        lsgdWardMember: {
          name: row.lsgdWardMemberName,
          contact: row.lsgdWardMemberContact,
        },
        ashaWorker: {
          name: row.ashaWorkerName,
          contact: row.ashaWorkerContact,
        },
        medicalOfficer: {
          name: row.medicalOfficerName,
          contact: row.medicalOfficerContact,
        },
      });
    }
  }
  log.info(`successfully built the final json`);
  await Deno.writeTextFile(OUTPUT, JSON.stringify(data));
  log.info(`successfully wrote data to path ${OUTPUT}`);
} catch (error) {
  log.critical(error);
  Deno.exit(1);
}

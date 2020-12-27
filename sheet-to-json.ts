import { parse } from "https://deno.land/std@0.74.0/encoding/csv.ts";
import * as log from "https://deno.land/std/log/mod.ts";

const SHEET_ID = Deno.env.get("SHEET_ID");
const OUTPUT = "rrt.json";

enum Districts {
  Thiruvananthapuram = 1,
  Kollam = 2,
  Pathanamthitta = 3,
  Alappuzha = 4,
  Kottayam = 5,
  Idukki = 6,
  Ernakulam = 7,
  Thrissur = 8,
  Palakkad = 9,
  Malappuram = 10,
  Kozhikode = 11,
  Wayanad = 12,
  Kannur = 13,
  Kasaragod = 14,
}

type ContactType = {
  name: string;
  contact: string;
};

type WardType = {
  name: string;
  wardNo: number;
  medicalOfficer: ContactType;
  ashaWorker: ContactType;
  lsgdWardMember: ContactType;
  kudumbaShree: ContactType;
  anganawadiTeacher: ContactType;
};

enum LsgdVariant {
  District = "District",
  Grama = "Grama",
  Block = "Block",
  Municipality = "Municipality",
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

const titleCase = (str: string) =>
  str
    .toLowerCase()
    .split(" ")
    .map((w: string) => w.replace(w[0], w[0].toUpperCase()))
    .join(" ");

// deno-lint-ignore no-explicit-any
const DistrictCache: Map<Districts, any> = new Map();

export const getWardName = async (
  district: string,
  lsgName: string,
  wardNo: number
): Promise<string> => {
  try {
    const d = Districts[district as keyof typeof Districts];
    if (!DistrictCache.has(d)) {
      const url = encodeURI(
        "https://careapi.coronasafe.in/api/v1/district/" +
          d +
          "/get_all_local_body"
      );
      const res = await fetch(url);
      const lsgs = await res.json();
      DistrictCache.set(d, lsgs);
    }
    const lsgs = DistrictCache.get(d);
    const lsg = lsgs.find(({ name }: { name: string }) =>
      name.startsWith(lsgName)
    );
    const ward = lsg.wards.find(
      ({ number }: { number: number }) => number === wardNo
    );
    return titleCase(ward.name);
  } catch (e) {
    log.error(
      `error getting wardname for district:${district} lsg:${lsgName} wardNo:${wardNo}`
    );
    return "";
  }
};

const generateLsg = (row: csvType): LsgdType => ({
  district: row.districtName.replace(" District", "").trim(),
  lsg: row.lsg
    .replace(`, ${row.districtName}`, "")
    .replace(" District", "")
    .replace(" Grama Panchayat", "")
    .replace(" Block Panchayat", "")
    .replace(" Muncipality", "")
    .replace(" Corporation", "")
    .trim(),
  wards: [],
  type:
    (row.lsg.match(/District/g) || []).length > 1
      ? LsgdVariant.District
      : row.lsg.includes("Grama")
      ? LsgdVariant.Grama
      : row.lsg.includes("Block")
      ? LsgdVariant.Block
      : row.lsg.includes("Muncipality")
      ? LsgdVariant.Municipality
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
    if (
      !row.lsg.startsWith(
        `${current.lsg} ${
          current.type === LsgdVariant.Municipality
            ? "Muncipality"
            : current.type
        }`
      ) &&
      row.lsg !== ""
    ) {
      data.push(current);
      current = generateLsg(row);
    }
    const parsedWard = parseInt(row.wardNo);
    if (!isNaN(parsedWard)) {
      // temporary fix for duplicate values
      if (current.wards.findIndex((a) => a.wardNo === parsedWard) != -1) {
        log.error(`duplicate ${row.lsg}, wardNo:${parsedWard}`);
        continue
      }
      current.wards.push({
        name: await getWardName(current.district, current.lsg, parsedWard),
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

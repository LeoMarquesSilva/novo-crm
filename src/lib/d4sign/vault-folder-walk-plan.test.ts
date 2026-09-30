import { describe, expect, it } from "vitest";
import {
  advanceFolderWalkCursor,
  clientFolderRefs,
  formatFolderWalkCursor,
  mergeFolderCatalog,
  parseFolderWalkCursor,
  type FolderWalkCursor,
} from "./vault-folder-walk-plan";

const AREA = "3cb77b83-2b9b-494c-88ae-4345f0baabfe";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("clientFolderRefs", () => {
  it("tira pasta de área e duplicata, e guarda o nome", () => {
    expect(
      clientFolderRefs([
        { uuid_folder: AREA, name: "Contratos" },
        { uuid_folder: CLIENT, name: "Cliente A" },
        { uuid_folder: CLIENT.toUpperCase(), name: "Cliente A" },
      ]),
    ).toEqual([{ uuid: CLIENT, name: "Cliente A" }]);
  });
});

describe("parseFolderWalkCursor", () => {
  it("começa em walk sem catálogo", () => {
    expect(parseFolderWalkCursor(null).catalogued).toBe(false);
    expect(parseFolderWalkCursor("lixo")).toMatchObject({ mode: "walk", folders: [] });
  });

  it("retoma pasta, página e nome", () => {
    const source = formatFolderWalkCursor({
      mode: "walk",
      index: 1,
      page: 2,
      refresh: false,
      catalogued: true,
      folders: [
        { uuid: CLIENT, name: "Cliente A" },
        { uuid: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Cliente B" },
      ],
    });
    expect(parseFolderWalkCursor(source)).toMatchObject({
      mode: "walk",
      index: 1,
      page: 2,
      catalogued: true,
    });
  });
});

describe("advanceFolderWalkCursor", () => {
  const cursor: FolderWalkCursor = {
    mode: "walk",
    index: 0,
    page: 1,
    refresh: false,
    catalogued: true,
    folders: [
      { uuid: "a", name: "A" },
      { uuid: "b", name: "B" },
    ],
  };

  it("permanece na pasta quando a página está cheia", () => {
    expect(advanceFolderWalkCursor(cursor, { docs: 499, totalPages: null }).page).toBe(2);
  });

  it("passa para a pasta seguinte quando a página é curta", () => {
    expect(advanceFolderWalkCursor(cursor, { docs: 4, totalPages: 1 })).toMatchObject({
      index: 1,
      page: 1,
      mode: "walk",
    });
  });

  it("vira steady ao terminar a primeira volta, sem pedir catálogo de novo", () => {
    expect(
      advanceFolderWalkCursor({ ...cursor, index: 1 }, { docs: 1, totalPages: 1 }),
    ).toMatchObject({ mode: "steady", index: 0, refresh: false });
  });

  it("pede catálogo novo quando a volta steady fecha", () => {
    expect(
      advanceFolderWalkCursor(
        { ...cursor, mode: "steady", index: 1 },
        { docs: 1, totalPages: 1 },
      ).refresh,
    ).toBe(true);
  });
});

describe("mergeFolderCatalog", () => {
  it("em steady, pasta nova reabre a varredura só nela", () => {
    const merged = mergeFolderCatalog(
      {
        mode: "steady",
        index: 0,
        page: 1,
        refresh: true,
        catalogued: true,
        folders: [{ uuid: CLIENT, name: "Antigo" }],
      },
      [
        { uuid: CLIENT, name: "Cliente A" },
        { uuid: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Novo" },
      ],
    );
    expect(merged).toMatchObject({
      mode: "walk",
      index: 1,
      refresh: false,
    });
    expect(merged.folders[1]?.name).toBe("Novo");
    expect(merged.folders[0]?.name).toBe("Cliente A");
  });
});

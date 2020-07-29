import * as yauzl from 'yauzl-promise';

interface IEntry {
  entryName: string;
  toUint8Array(): Uint8Array; // TODO: Maybe split out to toUint8ArrayToDisplay and toUint8ArrayToSave, so we can display pretty XML, and save minified XML.
}

class XmlPart implements IEntry {
  readonly type = 'XML';

  private _rawData: Uint8Array;

  constructor(readonly entryName: string, rawData: Uint8Array) {
    this._rawData = rawData;
    // TODO: Parse rawData into XML, so then toUint8Array can pretty-print it for display.
  }

  toUint8Array(): Uint8Array {
    return this._rawData;
  }
}

class BinaryPart implements IEntry { // Could call it VerbatimPart, for cases like .txt files which aren't XML, but we should leave as is.
  readonly type ='BINARY';

  constructor(readonly entryName: string, private readonly _rawData: Uint8Array) {
    ;
  }

  toUint8Array(): Uint8Array {
    return this._rawData;
  }
}

type Part = XmlPart | BinaryPart;

class Relationship implements IEntry {
  constructor(readonly entryName: string, private readonly _rawData: Uint8Array) {
    ;
  }

  toUint8Array(): Uint8Array {
    return this._rawData;
  }
}

const CONTENT_TYPES_ENTRY_NAME = '/[Content_Types].xml';

class ContentTypes implements IEntry {
  readonly entryName = CONTENT_TYPES_ENTRY_NAME;

  constructor(private readonly _rawData: Uint8Array) {
    ;
  }

  toUint8Array(): Uint8Array {
    return this._rawData;
  }
}

export class Package {
  private _contentTypes: ContentTypes;
  private _parts: Part[];
  private _rels: Relationship[];

  private constructor(rawEntryData: Map<string, Uint8Array>) {
    if (!rawEntryData.has(CONTENT_TYPES_ENTRY_NAME)) {
      throw new Error(`Package has no ${CONTENT_TYPES_ENTRY_NAME} file!`);
    }

    this._contentTypes = new ContentTypes(<Uint8Array>rawEntryData.get(CONTENT_TYPES_ENTRY_NAME))
    rawEntryData.delete(CONTENT_TYPES_ENTRY_NAME);

    this._parts = [];
    this._rels = [];

    rawEntryData.forEach((rawData, name) => {
      if (name.endsWith('.rels')) {
        this._rels.push(new Relationship(name, rawData))
      } else if (name.endsWith('.xml')) {
        this._parts.push(new XmlPart(name, rawData))
      } else {
        this._parts.push(new BinaryPart(name, rawData))
      }
    });
  }

  getAllEntryNames(): string[] {
    let entryNames = [this._contentTypes.entryName];
    entryNames = entryNames.concat(this._parts.map((part) => part.entryName));
    entryNames = entryNames.concat(this._rels.map((rel) => rel.entryName));

    return entryNames;
  }

  getEntryData(name: string): Uint8Array {
    const entries: IEntry[] = ([this._contentTypes] as IEntry[]).concat(this._parts, this._rels);
    const entry = entries.find((entry) => entry.entryName === name);
    if (entry) {
      return entry.toUint8Array();
    }
    throw new Error('Entry name not found');
  }

  static async fromFile(path: string): Promise<Package> {
    const zippedPackage = await yauzl.open(path); // TODO: We can be fancy and make this open from a stream, to support opening non-file:// URIs

    async function loadEntry(entry: yauzl.Entry): Promise<[string, Uint8Array]> {
      let stream = await entry.openReadStream();
      let chunks = [];
      for await (let chunk of stream) {
        chunks.push(chunk);
      }
      let buffer = Buffer.concat(chunks);
      const data = new Uint8Array(buffer);
      return ['/' + entry.fileName, data]; // yauzl's entry filenames don't include the initial '/'
    }

    let entry: yauzl.Entry | null = null;
    let loadingPromises: Promise<[string, Uint8Array]>[] = [];
    while (entry = await zippedPackage.readEntry()) {
      loadingPromises.push(loadEntry(entry));
    }

    const rawEntryData = new Map(await Promise.all(loadingPromises));
    let oxmlPackage = new Package(rawEntryData);
    return oxmlPackage;
  }
}
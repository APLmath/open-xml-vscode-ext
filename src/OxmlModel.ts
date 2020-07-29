import * as xmldoc from 'xmldoc';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl-promise';
import { TextDecoder, TextEncoder } from 'util';

interface IEntry {
  entryName: string;
  toUint8ArrayForDisplay(): Uint8Array;
  toUint8ArrayForSave(): Uint8Array;
}

abstract class XmlEntry implements IEntry {
  protected _document: xmldoc.XmlDocument;

  constructor(readonly entryName: string, rawData: Uint8Array) {
    const decoder = new TextDecoder('utf-8');
    const xmlString = decoder.decode(rawData);

    this._document = new xmldoc.XmlDocument(xmlString);
  }

  toUint8ArrayForDisplay(): Uint8Array {
    const encoder = new TextEncoder();
    const xmlString = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + this._document.toString();
    return encoder.encode(xmlString);
  }

  toUint8ArrayForSave(): Uint8Array {
    const encoder = new TextEncoder();
    const xmlString = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + this._document.toString({compressed: true});
    return encoder.encode(xmlString);
  }
}

class XmlPart extends XmlEntry {
  readonly partType = 'XML';

  constructor(entryName: string, rawData: Uint8Array) {
    super(entryName, rawData);
  }
}

class BinaryPart implements IEntry { // Could call it VerbatimPart, for cases like .txt files which aren't XML, but we should leave as is.
  readonly partType ='BINARY';

  constructor(readonly entryName: string, private readonly _rawData: Uint8Array) {
    ;
  }

  toUint8ArrayForDisplay(): Uint8Array {
    return this._rawData;
  }

  toUint8ArrayForSave(): Uint8Array {
    return this._rawData;
  }
}

type Part = XmlPart | BinaryPart;

class Relationship extends XmlEntry {
  constructor(entryName: string, rawData: Uint8Array) {
    super(entryName, rawData);
  }
}

const CONTENT_TYPES_ENTRY_NAME = '/[Content_Types].xml';

class ContentTypes extends XmlEntry {
  constructor(rawData: Uint8Array) {
    super(CONTENT_TYPES_ENTRY_NAME, rawData);
  }
}

export class Package {
  private _entries: Map<string, IEntry> = new Map();

  private constructor(rawEntryData: Map<string, Uint8Array>) {
    if (!rawEntryData.has(CONTENT_TYPES_ENTRY_NAME)) {
      throw new Error(`Package has no ${CONTENT_TYPES_ENTRY_NAME} file!`);
    }

    this._entries.set(CONTENT_TYPES_ENTRY_NAME, new ContentTypes(<Uint8Array>rawEntryData.get(CONTENT_TYPES_ENTRY_NAME)));
    rawEntryData.delete(CONTENT_TYPES_ENTRY_NAME);

    rawEntryData.forEach((rawData, name) => {
      if (name.endsWith('.rels')) {
        this._entries.set(name, new Relationship(name, rawData));
      } else if (name.endsWith('.xml')) {
        this._entries.set(name, (new XmlPart(name, rawData)));
      } else {
        this._entries.set(name, (new BinaryPart(name, rawData)));
      }
    });
  }

  getAllEntryNames(): string[] {
    return Array.from(this._entries.keys());
  }

  getEntryData(name: string): Uint8Array {
    const entry = this._entries.get(name);
    if (entry) {
      return entry.toUint8ArrayForDisplay();
    }
    throw new Error('Entry name not found');
  }

  writeEntryData(name: string, data: Uint8Array) {
    this._entries.set(name, new XmlPart(name, data));
  }

  static async fromUint8Array(rawData: Uint8Array): Promise<Package> {
    const buffer = Buffer.from(rawData);
    const zippedPackage = await yauzl.fromBuffer(buffer); // TODO: We can be fancy and make this open from a stream, to support opening non-file:// URIs

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

  async toUint8Array(): Promise<Uint8Array> {
    let zippedPackage = new yazl.ZipFile();

    const entryNames = this.getAllEntryNames();
    this._entries.forEach((entry, name) => {
      const data = entry.toUint8ArrayForSave();
      const buffer = Buffer.from(data);
      zippedPackage.addBuffer(buffer, name.substring(1)); // Take out the slash in beginning of name
    });
    zippedPackage.end();

    const stream = zippedPackage.outputStream;
    let chunks = [];
    for await (let chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    let buffer = Buffer.concat(chunks);
    const data = new Uint8Array(buffer);
    return data;
  }
}
import * as xmldoc from 'xmldoc';
import * as yazl from 'yazl';
import * as yauzl from 'yauzl-promise';
import { TextDecoder, TextEncoder } from 'util';
import path = require('path');

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
  private _relationshipTargets: string[] = [];

  constructor(entryName: string, rawData: Uint8Array) {
    super(entryName, rawData);

    this._document.eachChild((child) => {
      const targetName = path.join(entryName, '../../' + child.attr['Target']);
      this._relationshipTargets.push(targetName);
    });
  }

  getRelationshipTargets(): string[] {
    return this._relationshipTargets;
  }
}

const CONTENT_TYPES_ENTRY_NAME = '/[Content_Types].xml';

class ContentTypes extends XmlEntry {
  constructor(rawData: Uint8Array) {
    super(CONTENT_TYPES_ENTRY_NAME, rawData);
  }

  createEntry(name: string, rawData: Uint8Array) {
    // TODO: Actually use the content types data to determine each of these.
    if (name.endsWith('.rels')) {
      return new Relationship(name, rawData);
    } else if (name.endsWith('.xml')) {
      return new XmlPart(name, rawData);
    } else {
      return new BinaryPart(name, rawData);
    }
  }
}

export class Package {
  private _entries: Map<string, IEntry> = new Map();

  private get _contentTypes() : ContentTypes {
    const contentTypes = this._entries.get(CONTENT_TYPES_ENTRY_NAME);
    if (!(contentTypes instanceof ContentTypes)) {
      throw new Error(`Package has no ${CONTENT_TYPES_ENTRY_NAME} file!`);
    }
    return contentTypes;
  }
  

  private constructor(rawEntryData: Map<string, Uint8Array>) {
    if (!rawEntryData.has(CONTENT_TYPES_ENTRY_NAME)) {
      throw new Error(`Package has no ${CONTENT_TYPES_ENTRY_NAME} file!`);
    }

    this._entries.set(CONTENT_TYPES_ENTRY_NAME, new ContentTypes(<Uint8Array>rawEntryData.get(CONTENT_TYPES_ENTRY_NAME)));
    rawEntryData.delete(CONTENT_TYPES_ENTRY_NAME);

    rawEntryData.forEach((rawData, name) => {
      this._addEntry(name, rawData);
    });
  }

  private _addEntry(name: string, rawData: Uint8Array) {
    this._entries.set(name, this._contentTypes.createEntry(name, rawData));
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

  writeEntryData(name: string, rawData: Uint8Array) {
    this._addEntry(name, rawData);
  }

  removeEntries(names: string[]) {
    if (names.find((name) => name === CONTENT_TYPES_ENTRY_NAME)) {
      throw new Error(`You cannot remove the ${CONTENT_TYPES_ENTRY_NAME} entry.`);
    }

    names.forEach((name) => {
      this._entries.delete(name);
    });
  }

  getRelationships(name: string): string[] {
    const source = this._entries.get(name);
    if (!source) {
      throw new Error(`Entry ${name} doesn't exist.`);
    }

    if (!(source instanceof XmlPart) && !(source instanceof BinaryPart)) {
      throw new Error(`Entry ${name} is not a part.`);
    }

    const lastSlashIndex = name.lastIndexOf('/');
    const basename = name.substring(lastSlashIndex + 1);
    const expectedRelsName = name.substring(0, lastSlashIndex) + '/_rels/' + basename + ".rels";

    const relationship = this._entries.get(expectedRelsName);
    if (!relationship) {
      // No .rels file, that's okay. Just return empty array;
      return [];
    }

    if (!(relationship instanceof Relationship)) {
      throw new Error(`Expected relationship entry ${expectedRelsName} is not a .rels file.`);
    }

    return relationship.getRelationshipTargets();
  }

  static async fromUint8Array(rawData: Uint8Array): Promise<Package> {
    const buffer = Buffer.from(rawData);
    const zippedPackage = await yauzl.fromBuffer(buffer);

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
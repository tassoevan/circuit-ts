import type { AboutBox } from "./AboutBox";
import { Adjustable } from "./Adjustable";
import { ExportAsImageDialog } from "./ExportAsImageDialog";
import { ExportAsUrlDialog } from "./ExportAsUrlDialog";
import { ImportFromDropboxDialog } from "./ImportFromDropboxDialog";
import { ScopeExportImageDialog } from "./ScopeExportImageDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { SliderDialog } from "./SliderDialog";
import { SubcircuitDialog } from "./SubcircuitDialog";
import * as LZString from "lz-string";

declare global {
    interface Window {
        AboutBox: typeof AboutBox;
        Adjustable: typeof Adjustable;
        ExportAsImageDialog: typeof ExportAsImageDialog;
        ExportAsUrlDialog: typeof ExportAsUrlDialog;
        ImportFromDropboxDialog: typeof ImportFromDropboxDialog;
        ScopeExportImageDialog: typeof ScopeExportImageDialog;
        ShortcutsDialog: typeof ShortcutsDialog;
        SliderDialog: typeof SliderDialog;
        SubcircuitDialog: typeof SubcircuitDialog;
        C2S: {
            new (width: number, height: number): CanvasRenderingContext2D & { getSerializedSvg(): string };
        };
        LZString: typeof LZString;
        recorderBlob?: string;
        CircuitJS1?: any;
        oncircuitjsloaded?: (jsinterface: any) => void;
        Dropbox?: {
            isBrowserSupported(): boolean;
            choose(options: { success: (files: any[]) => void; linkType: string; multiselect: boolean }): void;
        };
    }

    interface Document {
        audioBlob?: string;
        audioObject?: HTMLAudioElement;
        exportBlob?: string;
    }
}

import type { AboutBox } from "./AboutBox";
import { Adjustable } from "./Adjustable";
import { ExportAsImageDialog } from "./ExportAsImageDialog";
import { ExportAsUrlDialog } from "./ExportAsUrlDialog";
import { ScopeExportImageDialog } from "./ScopeExportImageDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { SliderDialog } from "./SliderDialog";
import { SubcircuitDialog } from "./SubcircuitDialog";

declare global {
    interface Window {
        AboutBox: typeof AboutBox;
        Adjustable: typeof Adjustable;
        ExportAsImageDialog: typeof ExportAsImageDialog;
        ExportAsUrlDialog: typeof ExportAsUrlDialog;
        ScopeExportImageDialog: typeof ScopeExportImageDialog;
        ShortcutsDialog: typeof ShortcutsDialog;
        SliderDialog: typeof SliderDialog;
        SubcircuitDialog: typeof SubcircuitDialog;
        recorderBlob?: string;
        CircuitJS1?: any;
        oncircuitjsloaded?: (jsinterface: any) => void;
    }

    interface Document {
        audioBlob?: string;
        audioObject?: HTMLAudioElement;
        exportBlob?: string;
    }
}

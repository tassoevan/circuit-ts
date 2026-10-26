import type { AboutBox } from "./AboutBox";
import { Adjustable } from "./Adjustable";
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
        ImportFromDropboxDialog: typeof ImportFromDropboxDialog;
        ScopeExportImageDialog: typeof ScopeExportImageDialog;
        ShortcutsDialog: typeof ShortcutsDialog;
        SliderDialog: typeof SliderDialog;
        SubcircuitDialog: typeof SubcircuitDialog;
        C2S: {
            new (width: number, height: number): CanvasRenderingContext2D & { getSerializedSvg(): string };
        };
        LZString: typeof LZString;
    }

    interface Document {
        audioBlob?: string;
        audioObject?: HTMLAudioElement;
    }
}

import { DarlingtonElm } from "../DarlingtonElm";

export class PDarlingtonElm extends DarlingtonElm {
    constructor(xx: number, yy: number) {
        super(xx, yy, true);
    }
    override getDumpClass(): Function {
        return DarlingtonElm;
    }
}

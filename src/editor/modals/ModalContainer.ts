import { Component } from "../../japnaaEngine2d/elements";

export class ModalContainer extends Component {
    constructor() {
        super("modalContainer");
    }

    public addModal(modal: Component) {
        this.elm.append(modal);
    }
}

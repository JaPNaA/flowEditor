import { Component } from "../japnaaEngine2d/elements.js";

export class ModalContainer extends Component {
    constructor() {
        super("modalContainer");
    }

    public addModal(modal: Component) {
        this.elm.append(modal);
    }
}

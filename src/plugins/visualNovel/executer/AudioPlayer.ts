import { FileStructureRead } from "../../../filesystem/FileStructure";

export class AudioPlayer {
    public project!: FileStructureRead;

    private backgroundMusic: HTMLAudioElement = new Audio();
    private backgroundMusicSrc: string = "";
    private backgroundVolume = 0.4;
    private sfx: HTMLAudioElement = new Audio();
    private sfxVolume = 0.6;

    constructor() {
        this.backgroundMusic.volume = this.backgroundVolume;
        this.backgroundMusic.loop = true;
        this.sfx.volume = this.sfxVolume;
    }

    public setBackgroundVolume(volume: number) {
        this.backgroundVolume = this.backgroundMusic.volume = volume;
    }

    public setSFXVolume(volume: number) {
        this.sfxVolume = this.sfx.volume = volume;
    }

    public async setBackgroundMusic(src: string) {
        if (this.backgroundMusic.src) {
            URL.revokeObjectURL(this.backgroundMusic.src);
        }
        this.backgroundMusicSrc = src;
        if (src) {
            this.backgroundMusic.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.backgroundMusic.play();
        } else {
            this.backgroundMusic.pause();
        }
    }

    public async playSFX(src: string) {
        if (this.sfx.src) {
            URL.revokeObjectURL(this.sfx.src);
        }
        if (src) {
            this.sfx.src = URL.createObjectURL(
                await this.project.getAsset(src)
            );
            this.sfx.play();
        } else {
            this.sfx.pause();
        }
    }

    public getState() {
        return {
            backgroundMusic: this.backgroundMusicSrc,
            backgroundVolume: this.backgroundVolume,
            sfxVolume: this.sfxVolume
        };
    }

    public setState(state: any) {
        this.setBackgroundMusic(state.backgroundMusic);
        this.setBackgroundVolume(state.backgroundVolume);
        this.setSFXVolume(state.sfxVolume);
    }

    public dispose() {
        this.sfx.pause();
        this.backgroundMusic.pause();
        if (this.sfx.src) { URL.revokeObjectURL(this.sfx.src); }
        if (this.backgroundMusic.src) { URL.revokeObjectURL(this.backgroundMusic.src); }
    }
}

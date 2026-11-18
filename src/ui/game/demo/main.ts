import { mountGameUI } from "../index";
import { createDemoAdapter } from "./adapter";
const root = document.querySelector<HTMLElement>("#game-preview");
if (root) mountGameUI(root, createDemoAdapter());

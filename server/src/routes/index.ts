import { Router, type IRouter } from "express";
import health from "./health.js";
import auth from "./auth.js";
import generate from "./generate.js";
import fetchUrl from "./fetch-url.js";
import competitorAds from "./competitor-ads.js";
import hypothesis from "./hypothesis.js";
import editorQa from "./editor-qa.js";
import reports from "./reports.js";
import canva from "./canva.js";
import miro from "./miro.js";
import drive from "./drive.js";
import convert from "./convert.js";
import agent from "./agent.js";
import refs from "./refs.js";
import setup from "./setup.js";

const router: IRouter = Router();

router.use(health);
router.use(auth);
router.use(generate);
router.use(fetchUrl);
router.use(competitorAds);
router.use(hypothesis);
router.use(editorQa);
router.use(reports);
router.use(convert);
router.use(refs);
router.use("/canva", canva);
router.use("/miro", miro);
router.use("/drive", drive);
router.use("/agent", agent);
router.use("/setup", setup);

export default router;

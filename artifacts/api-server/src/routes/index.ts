import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import perfilRouter from "./perfil";
import veiculosRouter from "./veiculos";
import esperasRouter from "./esperas";
import cobrancasRouter from "./cobrancas";
import assinaturasRouter from "./assinaturas";
import tarifasRouter from "./tarifas";
import publicRouter from "./public";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(perfilRouter);
router.use(veiculosRouter);
router.use(esperasRouter);
router.use(cobrancasRouter);
router.use(assinaturasRouter);
router.use(tarifasRouter);
router.use(publicRouter);

export default router;

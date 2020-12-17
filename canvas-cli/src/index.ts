#!/usr/bin/env node

import "reflect-metadata";
import { Container } from "typedi";
import CLI from "./CLI";

const cli = Container.get(CLI);
cli.run();

import questionsJson from '../data/questions.json';
import { createBundledBank } from './questionBank';

/** The questions.json shipped with this build. */
export const BUNDLED_BANK = createBundledBank(questionsJson as unknown[]);

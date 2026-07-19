import { runSuite, printReport } from './sim.mjs';
printReport(runSuite({
  '4p competent (balanced+steward)': ['balanced','steward','balanced','steward'],
  '4p all balanced':                 ['balanced','balanced','balanced','balanced'],
  '2p balanced':                     ['balanced','balanced'],
  '3p balanced+steward+expander':    ['balanced','steward','expander'],
}, 400));

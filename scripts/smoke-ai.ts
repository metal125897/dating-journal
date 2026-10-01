import {generate} from "../src/lib/provider";
import {JournalError} from "../src/lib/domain";
try {const result=await generate("tags",{text:"Встретились в кафе, заранее договорились о времени."});console.log("Настоящий GigaChat ответил на вымышленный smoke-test:",JSON.stringify(result));}catch(e){console.error(e instanceof JournalError?`${e.code}: ${e.message}`:"Запрос AI не выполнен");process.exitCode=1;}

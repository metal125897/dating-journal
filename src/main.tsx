import React from "react";
import {createRoot} from "react-dom/client";
import Journal from "./components/Journal";
import "./app/styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><Journal/></React.StrictMode>);

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import fs from "node:fs";
import path from "node:path";
import test from "ava";
import cv from "..";

test.before(async () => {
  await new Promise<void>((resolve) => {
    cv.onRuntimeInitialized = resolve;
  });
});

test("cv contour", async (t) => {
  // The files were generated using command:
  // magick square.png square.rgba
  // magick square.png square.json
  // This is a 701x375 image with a 576x267 square at about [114, 10].
  // So the center of the square is at about [402, 143].
  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../testdata/square.json"), { encoding: "utf-8" }),
  );
  const buf = fs.readFileSync(path.join(__dirname, "../testdata/square.rgba"), { encoding: null });
  const array = new Uint8Array(buf);
  const mat = cv.matFromArray(
    meta[0].image.geometry.height,
    meta[0].image.geometry.width,
    cv.CV_8UC4,
    array,
  );
  const channels = new cv.MatVector();
  cv.split(mat, channels);
  const mask = channels.get(3).clone();
  cv.threshold(channels.get(3), mask, 230, 255, cv.THRESH_BINARY);
  const masked = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC4);
  cv.bitwise_and(mat, mat, masked, mask);
  const gray = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC1);
  cv.cvtColor(masked, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, gray, 230, 255, cv.THRESH_BINARY);
  const cvContours = new cv.MatVector();
  const cvHierachy = new cv.Mat();
  cv.findContours(gray, cvContours, cvHierachy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
  // Filter out contours that are too small.
  const contours = [...Array(cvContours.size())].map((_, i) => {
    const contour = cvContours.get(i);
    if (cv.contourArea(contour) < 10000) {
      return undefined;
    }
    return contour;
  });
  // Convert hierarchy to a JS array
  const hierarchy: { children: number[] }[] = [...Array(cvHierachy.cols)].reduce(
    (acc, _, i) => {
      const [_next, _prev, _child, parent] = cvHierachy.intPtr(0, i);
      if (parent >= 0) {
        acc[parent].children.push(i);
      }
      return acc;
    },
    [...Array(cvHierachy.cols)].map(() => ({ children: [] })),
  );
  // Find a leaf contour.
  const interestedContour = contours.findIndex((contour, i) => {
    return contour && hierarchy[i].children.every((child) => !contours[child]);
  });

  const contourImage = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC1);
  cv.drawContours(contourImage, cvContours, interestedContour, new cv.Scalar(255), cv.FILLED);

  const innerAreaImage = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC1);
  const bounds = {
    top: 77,
    left: 217,
    bottom: 191,
    right: 585,
  };
  cv.rectangle(
    innerAreaImage,
    new cv.Point(bounds.left, bounds.top),
    new cv.Point(bounds.right, bounds.bottom),
    new cv.Scalar(255),
    cv.FILLED,
  );
  const innerArea = cv.countNonZero(innerAreaImage);

  cv.bitwise_and(contourImage, innerAreaImage, contourImage);
  const intersection = cv.countNonZero(contourImage);

  t.is(intersection, innerArea);
});

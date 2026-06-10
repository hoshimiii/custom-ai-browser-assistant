export function isImageDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(String(value || ""));
}

export function buildScreenshotPrompt(question) {
  const text = String(question || "").trim();
  return text || "请分析这张浏览器截图，概括主要内容、关键信息和可执行建议。";
}

export function buildImageQuestionMessage(imageDataUrl, question = "") {
  if (!isImageDataUrl(imageDataUrl)) {
    throw new Error("无效的图片 data URL");
  }
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: buildScreenshotPrompt(question)
      },
      {
        type: "image_url",
        image_url: {
          url: imageDataUrl
        }
      }
    ]
  };
}

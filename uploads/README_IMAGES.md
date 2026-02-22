# Image Support Guide

## Supported Image Formats

The RAG system now supports the following image formats:
- **JPEG** (.jpg, .jpeg)
- **PNG** (.png)

## How It Works

When you ingest an image file, the system:

1. **Reads the image** and converts it to base64
2. **Sends to GPT-4 Vision API** for analysis
3. **Extracts**:
   - All visible text (OCR functionality)
   - Detailed description of visual content
   - Charts, diagrams, and data visualization interpretation
4. **Chunks and embeds** the extracted content
5. **Stores in Pinecone** for semantic search

## Use Cases

### 📊 Charts and Graphs
Upload sales charts, financial graphs, or performance dashboards. The system will:
- Extract numerical data from charts
- Describe trends and patterns
- Identify key insights

### 📄 Screenshots of Documents
- Scanned receipts
- Screenshots of web pages
- Product mockups
- Presentation slides

### 🎨 Product Images
- Product photos with descriptions
- Architectural diagrams
- Flowcharts and process diagrams
- Infographics

### 📋 Forms and Tables
- Filled forms
- Data tables
- Spreadsheet screenshots
- Organizational charts

## Example Queries

After ingesting images, you can ask:

```
"What data is shown in the sales chart?"
"Describe the product diagram"
"What are the numbers from the Q4 performance graph?"
"What text appears in the screenshot?"
"Summarize the infographic about our products"
```

## Best Practices

1. **Image Quality**: Higher resolution images (min 800x600) provide better results
2. **Clear Text**: Ensure text in images is readable and well-contrasted
3. **File Size**: Keep images under 20MB for faster processing
4. **Naming**: Use descriptive filenames (e.g., `q4_sales_chart.png` instead of `IMG_1234.png`)

## Example Workflow

```bash
# 1. Place image in uploads folder
cp ~/Documents/sales_chart.png ./uploads/

# 2. Run ingestion
npm run ingest

# 3. Select "Ingest directory" and enter ./uploads

# 4. Ask questions about the image
npm run dev
> "What data is shown in the sales chart?"
```

## Technical Details

- **Model**: GPT-4 Vision (gpt-4o with vision capabilities)
- **Max Tokens**: 4096 per image analysis
- **Cost**: ~$0.01-0.03 per image depending on size and resolution
- **Processing Time**: 5-15 seconds per image

## Limitations

- Very small or blurry text may not be recognized accurately
- Complex multi-page documents should be split into separate images
- Handwritten text recognition may vary in accuracy
- Colors and visual styling are described but may lose detail in text extraction

## Tips for Better Results

✅ **DO:**
- Use clear, high-resolution images
- Ensure good lighting and contrast
- Crop to relevant content
- Use descriptive filenames

❌ **DON'T:**
- Upload extremely large files (>20MB)
- Use heavily compressed or pixelated images
- Include sensitive information without proper access controls
- Rely solely on images when structured data is available

---

For more information, see the main [README.md](../README.md)

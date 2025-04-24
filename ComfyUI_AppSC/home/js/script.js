const serverAddress = '127.0.0.1:8188';
const clientId = uuidv4();
let promptId = null;

// Elementos de la interfaz
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('image');
const fileSelectButton = document.getElementById('fileSelectButton');
const imagePreview = document.getElementById('imagePreview');
const submitContainer = document.getElementById('submit-container');
const downloadContainer = document.getElementById('download-container');
const downloadLink = document.getElementById('download-link');
const statusMessage = document.getElementById('status-message');
const resultImage = document.getElementById('resultImage');

// Evitar comportamiento por defecto en arrastrar/soltar
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Resaltar área de arrastre
['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
});

// Manejo del archivo soltado
dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    fileInput.files = files;
    handleFiles(files);
}

fileSelectButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', function(event) {
    const files = event.target.files;
    handleFiles(files);
});

function handleFiles(files) {
    imagePreview.innerHTML = ''; // Limpiar previsualización
    resultImage.src = ''; // Limpiar imagen previa procesada
    resultImage.style.display = 'none';
    downloadContainer.style.display = 'none';

    [...files].forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.createElement('img');
            img.src = e.target.result;
            imagePreview.appendChild(img);
            submitContainer.style.display = 'flex';
            displayStatus("Imagen cargada correctamente.", "success");
        };
        reader.readAsDataURL(file);
    });
}

// Procesar formulario
document.getElementById('imageForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const imageFile = fileInput.files[0];
    if (!imageFile) {
        displayStatus("Por favor, selecciona una imagen antes de enviar.", "error");
        return;
    }

    displayStatus("Procesando imagen...", "loading");

    try {
        const uploadResponse = await uploadImage(imageFile);
        let promptWorkflow = await readWorkflowAPI();

        promptWorkflow["18"]["inputs"]["seed"] = Math.floor(Math.random() * 1e18);
        promptWorkflow["15"]["inputs"]["image"] = uploadResponse.name; // Asegúrate que sea nodo 15

        promptId = await queuePrompt(promptWorkflow);
        console.log(`Prompt encolado con ID: ${promptId}`);

        const socket = new WebSocket(`ws://${serverAddress}/ws?clientId=${clientId}`);

        socket.onopen = () => console.log("Conexión WebSocket establecida");
        socket.onerror = error => console.error("Error en WebSocket:", error);
        socket.onmessage = async function(event) {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'executed' && message.data.prompt_id === promptId) {
                    console.log("Ejecución completada:", message);

                    const images = message.data.output.images;
                    for (const image of images) {
                        const imageUrl = `http://${serverAddress}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${encodeURIComponent(image.type)}`;

                        const response = await fetch(imageUrl);
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);

                        resultImage.src = url;
                        resultImage.style.display = 'block';

                        downloadLink.href = url;
                        downloadLink.download = image.filename;
                        downloadLink.style.display = 'inline-block';
                        downloadContainer.style.display = 'block';
                    }

                    displayStatus("Procesamiento completado con éxito.", "success");
                }
            } catch (error) {
                console.error("Error al procesar mensaje WebSocket:", error);
                displayStatus("Ocurrió un error al procesar el mensaje del servidor.", "error");
            }
        };
    } catch (error) {
        console.error("Error durante el procesamiento:", error);
        displayStatus("Error al procesar la imagen.", "error");
    }
});

// Subir imagen al backend
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`http://${serverAddress}/upload/image`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error("Error al subir la imagen.");
    }
    return response.json();
}

// Leer workflow JSON
async function readWorkflowAPI() {
    const response = await fetch('/home/js/workflow_api.json');
    if (!response.ok) {
        throw new Error("Error al leer el archivo workflow_api.json.");
    }
    return response.json();
}

// Encolar el prompt
async function queuePrompt(promptWorkflow) {
    const postData = JSON.stringify({ prompt: promptWorkflow, client_id: clientId });

    const response = await fetch(`http://${serverAddress}/prompt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: postData
    });

    if (!response.ok) {
        throw new Error("Error al encolar el prompt.");
    }

    const result = await response.json();
    return result.prompt_id;
}

// Mostrar mensajes de estado
function displayStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.style.color = type === "success" ? "green" : type === "error" ? "red" : "blue";
}

// Generar UUID
function uuidv4() {
    return crypto.randomUUID();
}

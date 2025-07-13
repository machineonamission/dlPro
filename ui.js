let html_console = document.getElementById("console");

function uilog(message) {
    html_console.textContent += message;
    html_console.scrollTo({
        top: html_console.scrollHeight,
        left: 0,
        behavior: 'instant'
    });
}


window.featureDemo = {
    run: async function (endpoint, attempts) {
        let firstResult;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const response = await fetch(endpoint, { method: "POST" });
            let body;

            try {
                body = await response.json();
            } catch {
                body = {};
            }

            if (firstResult === undefined) {
                firstResult = {
                    statusCode: response.status,
                    message: body?.message ?? body?.title ?? "The request failed."
                };
            }
        }

        return firstResult;
    }
};

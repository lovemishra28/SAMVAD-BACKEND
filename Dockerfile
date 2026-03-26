# 1. Start with a standard Node.js image
FROM node:18

# 2. Install Python and pip
RUN apt-get update && apt-get install -y python3 python3-pip

# 3. Set the working directory inside the server
WORKDIR /app

# 4. Copy Node package files and install dependencies
COPY package*.json ./
RUN npm install

# 5. Copy Python requirements and install them
COPY ml/requirements.txt ./ml/
RUN pip3 install --no-cache-dir -r ml/requirements.txt --break-system-packages

# 6. Copy all the rest of your server code
COPY . .

# 7. Expose the port (Render automatically assigns one, but this is a good default)
EXPOSE 5000

# 8. Start the Node server
CMD ["node", "index.js"]
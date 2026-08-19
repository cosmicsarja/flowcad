FROM ubuntu:22.04

# Avoid tzdata interactive prompt during apt install
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for adding PPA and KiCad
RUN apt-get update && apt-get install -y \
    software-properties-common \
    wget \
    git \
    make \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Add KiCad 8.0 PPA and install KiCad
RUN add-apt-repository --yes ppa:kicad/kicad-8.0 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    kicad \
    kicad-packages3d \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies
COPY requirements.txt .

# Install Python requirements
# Using --break-system-packages because we are in a container where system python is meant for the app
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Set up environment variables
ENV KICAD_CLI_PATH=kicad-cli
ENV WORK_DIR=/app/tmp

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 8000

# Start the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

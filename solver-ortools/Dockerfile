# Imagen de la Lambda de OR-Tools (US-ALGO-ORTOOLS). Se construye para linux/amd64 (la función es x86_64):
#   docker build --platform linux/amd64 -t calendarschool-ortools solver-ortools
# En el despliegue la construye CDK (`DockerImageCode.fromImageAsset`).
FROM public.ecr.aws/lambda/python:3.12

# Solo las dependencias de ejecución; pytest y ruff son de desarrollo.
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

COPY solver.py cli.py handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.handler"]

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get('summary')
  getSummary() {
    return this.productsService.getSummary();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST, Role.CLIENT)
  @Get()
  listProducts() {
    return this.productsService.listProducts();
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Get(':id')
  getProductById(@Param('id') id: string) {
    return this.productsService.getProductById(id);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Post()
  createProduct(@Body() createProductDto: CreateProductDto) {
    return this.productsService.createProduct(createProductDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Patch(':id')
  updateProduct(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(id, updateProductDto);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.SPECIALIST)
  @Delete(':id')
  removeProduct(@Param('id') id: string) {
    return this.productsService.removeProduct(id);
  }
}
